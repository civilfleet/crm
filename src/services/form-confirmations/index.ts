import type { Prisma } from "@prisma/client";
import { getTransporter } from "@/lib/nodemailer";
import prisma from "@/lib/prisma";
import {
  confirmationLink,
  createConfirmationToken,
  FORM_CONFIRMATION_DAYS,
  type FormConfirmationMessage,
} from "@/lib/public-forms/confirmation";
import { renderConfirmationEmail } from "@/lib/public-forms/confirmation-email";
import {
  type PublishedFormReader,
  PublishedFormUnavailableError,
} from "@/lib/public-forms/published-form";
import { FORM_ENGAGEMENT_EXTERNAL_SOURCE } from "@/lib/public-forms/submission";
import { sendScalewayTransactionalEmail } from "@/services/integrations/scaleway-email";

/*
  Double opt-in for website form submissions: send the confirmation e-mail,
  mark the submission confirmed when the link is used, and remove what was
  never confirmed. Runs in the public intake consumer
  (scripts/consume-public-intake.ts). docs/PUBLIC_FORMS_INTAKE.md,
  "Confirmation".
*/

const DAY = 24 * 60 * 60_000;

export type ConfirmationLimits = {
  /** E-mails per round; the rest wait for the next round. */
  batch: number;
  /** Confirmation e-mails to all addresses per hour. */
  perHour: number;
  /** Confirmation e-mails to one address per day, all forms together. */
  perAddressPerDay: number;
  /**
   * E-mails per sender (as the bridge counts it: IPv4 address or IPv6 /64)
   * per hour, so one machine cannot use up the hourly budget. Above it,
   * e-mails wait: people behind a shared mobile address still get theirs.
   */
  perSourcePerHour: number;
  /** E-mails sent at the same time. */
  concurrency: number;
};

export const DEFAULT_CONFIRMATION_LIMITS: ConfirmationLimits = {
  batch: 100,
  perHour: 1000,
  perAddressPerDay: 5,
  perSourcePerHour: 30,
  concurrency: 5,
};

/** The limits from configuration (FORM_CONFIRMATION_*), or the defaults. */
export const readConfirmationLimits = (
  env: Record<string, string | undefined>,
): ConfirmationLimits => {
  const number = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  const d = DEFAULT_CONFIRMATION_LIMITS;
  return {
    batch: number(env.FORM_CONFIRMATION_BATCH, d.batch),
    perHour: number(env.FORM_CONFIRMATION_PER_HOUR, d.perHour),
    perAddressPerDay: number(
      env.FORM_CONFIRMATION_PER_ADDRESS_PER_DAY,
      d.perAddressPerDay,
    ),
    perSourcePerHour: number(
      env.FORM_CONFIRMATION_PER_SOURCE_PER_HOUR,
      d.perSourcePerHour,
    ),
    concurrency: number(env.FORM_CONFIRMATION_CONCURRENCY, d.concurrency),
  };
};

export type ConfirmationMail = {
  teamId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Sends through the team's Scaleway Transactional Email when it is set up
 * and its sender verified (Team Settings → Integrations), otherwise through
 * the CRM's SMTP. Scaleway is built for volume and signs for the domain.
 */
const createSender = () => {
  const senders = new Map<
    string,
    Promise<{ email: string; name?: string } | null>
  >();
  const scalewaySender = (teamId: string) => {
    let sender = senders.get(teamId);
    if (!sender) {
      sender = prisma.integrationConnection
        .findUnique({
          where: {
            teamId_provider: { teamId, provider: "SCALEWAY_TEM" },
          },
          select: {
            isEnabled: true,
            apiKey: true,
            defaultListId: true,
            senderEmail: true,
            senderName: true,
            lastSyncedAt: true,
          },
        })
        .then((integration) =>
          integration?.isEnabled &&
          integration.apiKey &&
          integration.defaultListId &&
          integration.senderEmail &&
          integration.lastSyncedAt
            ? {
                email: integration.senderEmail,
                name: integration.senderName ?? undefined,
              }
            : null,
        );
      senders.set(teamId, sender);
    }
    return sender;
  };
  return async (mail: ConfirmationMail) => {
    const from = await scalewaySender(mail.teamId);
    if (from) {
      await sendScalewayTransactionalEmail({
        teamId: mail.teamId,
        from,
        to: { email: mail.to },
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      return;
    }
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  };
};

/** The contact's name for "Hi {{name}}", not the address it fell back to. */
const greetingName = (name: string, email: string) =>
  name.trim().toLowerCase() === email.toLowerCase() ? "" : name.trim();

/** Runs `work` over `items`, at most `limit` at a time. */
const inParallel = async <T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
) => {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
};

/**
 * Sends the confirmation e-mails that are due, oldest first, within the
 * limits (ConfirmationLimits). Every submission is confirmed by its own
 * e-mail: a second submission of the same form gets one too, since nothing
 * else proves it came from the address's owner.
 * - Over the per-address limit: not sent, marked handled (expires).
 * - Over the hourly or per-source limit, or the form file unreadable, or
 *   sending failed: waits for a later round.
 */
export const sendDueConfirmations = async ({
  readForm,
  websiteUrl,
  key,
  send = createSender(),
  limits = DEFAULT_CONFIRMATION_LIMITS,
  now = new Date(),
  log = console,
}: {
  readForm: PublishedFormReader;
  websiteUrl: string;
  key: string;
  send?: (mail: ConfirmationMail) => Promise<void>;
  limits?: ConfirmationLimits;
  now?: Date;
  log?: Pick<Console, "info" | "warn" | "error">;
}) => {
  const result = { sent: 0, skipped: 0, waiting: 0 };
  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  const dayAgo = new Date(now.getTime() - DAY);
  const sentLastHour = await prisma.formSubmission.count({
    where: { confirmationSentAt: { gt: hourAgo }, confirmationSkipped: null },
  });
  let budget = Math.min(limits.batch, limits.perHour - sentLastHour);
  if (budget <= 0) return result;

  const due = await prisma.formSubmission.findMany({
    where: {
      confirmationRequested: true,
      confirmedAt: null,
      confirmationSentAt: null,
      receivedAt: {
        gt: new Date(now.getTime() - FORM_CONFIRMATION_DAYS * DAY),
      },
    },
    orderBy: { receivedAt: "asc" },
    // Some may wait for their source; look a little further ahead.
    take: budget * 2,
    select: {
      id: true,
      submissionId: true,
      teamId: true,
      formId: true,
      locale: true,
      email: true,
      sourceKey: true,
      contact: { select: { name: true } },
    },
  });
  if (due.length === 0) return result;

  // What the addresses and sources of this round already had.
  const emails = [
    ...new Set(due.flatMap((row) => (row.email ? [row.email] : []))),
  ];
  const sources = [
    ...new Set(due.flatMap((row) => (row.sourceKey ? [row.sourceKey] : []))),
  ];
  const [byAddress, bySource] = await Promise.all([
    emails.length
      ? prisma.formSubmission.groupBy({
          by: ["email"],
          where: {
            email: { in: emails },
            confirmationSentAt: { gt: dayAgo },
            confirmationSkipped: null,
          },
          _count: { _all: true },
        })
      : [],
    sources.length
      ? prisma.formSubmission.groupBy({
          by: ["sourceKey"],
          where: {
            sourceKey: { in: sources },
            confirmationSentAt: { gt: hourAgo },
            confirmationSkipped: null,
          },
          _count: { _all: true },
        })
      : [],
  ]);
  const toAddress = new Map(
    byAddress.map((row) => [row.email ?? "", row._count._all]),
  );
  const fromSource = new Map(
    bySource.map((row) => [row.sourceKey ?? "", row._count._all]),
  );

  // Decide first (one by one, so the counts hold), then send in parallel.
  // Only e-mails actually sent count toward the limits; a skipped one
  // records why.
  const markHandled = (id: string, skipped?: "address-limit" | "no-address") =>
    prisma.formSubmission.update({
      where: { id },
      data: { confirmationSentAt: now, confirmationSkipped: skipped ?? null },
    });
  const toSend: typeof due = [];
  for (const submission of due) {
    const email = submission.email?.toLowerCase();
    if (!email || (toAddress.get(email) ?? 0) >= limits.perAddressPerDay) {
      await markHandled(submission.id, email ? "address-limit" : "no-address");
      result.skipped++;
      continue;
    }
    const source = submission.sourceKey;
    if (
      budget <= 0 ||
      (source && (fromSource.get(source) ?? 0) >= limits.perSourcePerHour)
    ) {
      result.waiting++;
      continue;
    }
    toAddress.set(email, (toAddress.get(email) ?? 0) + 1);
    if (source) fromSource.set(source, (fromSource.get(source) ?? 0) + 1);
    budget--;
    toSend.push(submission);
  }

  await inParallel(toSend, limits.concurrency, async (submission) => {
    const email = (submission.email ?? "").toLowerCase();
    try {
      const form = await readForm(submission.formId, submission.locale);
      const mail = renderConfirmationEmail({
        form,
        locale: submission.locale,
        name: greetingName(submission.contact.name, email),
        link: confirmationLink(
          websiteUrl,
          submission.locale,
          createConfirmationToken(submission.submissionId, key),
          submission.formId,
        ),
      });
      await send({
        teamId: submission.teamId,
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      await markHandled(submission.id);
      result.sent++;
    } catch (error) {
      result.waiting++;
      log.warn(
        error instanceof PublishedFormUnavailableError
          ? "Form confirmation waits for the published form file."
          : "Form confirmation e-mail not sent; retrying on the next round.",
        JSON.stringify({
          formId: submission.formId,
          locale: submission.locale,
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
    }
  });
  return result;
};

/**
 * Marks a submission confirmed and grants the consents it asked for, once.
 * An unknown submission (removed, or never ours) is ignored.
 */
export const confirmFormSubmission = async (
  message: FormConfirmationMessage,
) => {
  const confirmedAt = new Date(message.confirmedAt);
  return prisma.$transaction(async (tx) => {
    const submission = await tx.formSubmission.findUnique({
      where: { submissionId: message.submissionId },
      select: { id: true, submissionId: true, confirmedAt: true },
    });
    if (!submission) return "unknown" as const;
    if (submission.confirmedAt) return "already" as const;

    await tx.formSubmission.update({
      where: { id: submission.id },
      data: { confirmedAt },
    });
    const pending = await tx.contactConsent.findMany({
      where: { submissionId: submission.submissionId, status: "PENDING" },
    });
    if (pending.length) {
      await tx.contactConsent.createMany({
        data: pending.map((consent) => ({
          teamId: consent.teamId,
          contactId: consent.contactId,
          purpose: consent.purpose,
          status: "GRANTED" as const,
          wording: consent.wording,
          locale: consent.locale,
          source: consent.source,
          submissionId: consent.submissionId,
          formId: consent.formId,
          recordedBy: "Website form, e-mail confirmed",
          recordedAt: confirmedAt,
        })),
      });
    }
    return "confirmed" as const;
  });
};

/** Every table a contact can appear in besides what one submission made. */
const hasOtherHistory = async (
  tx: Prisma.TransactionClient,
  contactId: string,
) => {
  const counts = await Promise.all([
    tx.formSubmission.count({ where: { contactId } }),
    tx.eventRegistration.count({ where: { contactId } }),
    tx.contactEngagement.count({ where: { contactId } }),
    tx.contactConsent.count({ where: { contactId } }),
    tx.contactListMember.count({ where: { contactId } }),
    tx.contactGroup.count({ where: { contactId } }),
    tx.eventContact.count({ where: { contactId } }),
    tx.contactOrganization.count({ where: { contactId } }),
    tx.file.count({ where: { contactId } }),
    tx.emailRecipient.count({ where: { contactId } }),
    tx.inboundEmailMessage.count({ where: { contactId } }),
    tx.contactAccessReview.count({ where: { contactId } }),
    tx.contactAttribute.count({ where: { contactId } }),
    tx.contactSocialLink.count({ where: { contactId } }),
    tx.organization.count({ where: { contactPersonId: contactId } }),
    // A change by a person, not by the intake.
    tx.contactChangeLog.count({ where: { contactId, userId: { not: null } } }),
  ]);
  return counts.some((count) => count > 0);
};

/**
 * Removes submissions never confirmed within FORM_CONFIRMATION_DAYS: the
 * submission, its pending consents, its engagement and its open proposals,
 * and the contact too when this submission made it and nothing else refers
 * to it.
 */
export const removeExpiredUnconfirmed = async (
  now = new Date(),
  batch = 100,
) => {
  const expired = await prisma.formSubmission.findMany({
    where: {
      confirmationRequested: true,
      confirmedAt: null,
      receivedAt: {
        lte: new Date(now.getTime() - FORM_CONFIRMATION_DAYS * DAY),
      },
    },
    orderBy: { receivedAt: "asc" },
    take: batch,
    select: {
      id: true,
      submissionId: true,
      contactId: true,
      createdContact: true,
    },
  });
  let contactsRemoved = 0;
  for (const submission of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.contactConsent.deleteMany({
        where: { submissionId: submission.submissionId, status: "PENDING" },
      });
      await tx.contactEngagement.deleteMany({
        where: {
          externalId: submission.submissionId,
          externalSource: FORM_ENGAGEMENT_EXTERNAL_SOURCE,
        },
      });
      // Proposals this submission made that nobody acted on.
      await tx.$executeRaw`
        DELETE FROM "ContactChangeLog" p
        WHERE p."contactId" = ${submission.contactId}
          AND p."action" = 'PROPOSED'
          AND p."metadata"->>'submissionId' = ${submission.submissionId}
          AND NOT EXISTS (
            SELECT 1 FROM "ContactChangeLog" r WHERE r."proposalId" = p."id"
          )
      `;
      await tx.formSubmission.delete({ where: { id: submission.id } });
      if (
        submission.createdContact &&
        !(await hasOtherHistory(tx, submission.contactId))
      ) {
        await tx.contact.delete({ where: { id: submission.contactId } });
        contactsRemoved++;
      }
    });
  }
  return { submissionsRemoved: expired.length, contactsRemoved };
};
