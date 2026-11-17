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
};

export const DEFAULT_CONFIRMATION_LIMITS: ConfirmationLimits = {
  batch: 25,
  perHour: 300,
  perAddressPerDay: 3,
};

type Mail = { to: string; subject: string; html: string; text: string };

const sendWithSmtp = async (mail: Mail) => {
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    ...mail,
  });
};

/** The contact's name for "Hi {{name}}", not the address it fell back to. */
const greetingName = (name: string, email: string) =>
  name.trim().toLowerCase() === email.toLowerCase() ? "" : name.trim();

/**
 * Sends the confirmation e-mails that are due, within the limits:
 * - `perAddressPerDay` per address, all forms together;
 * - `perHour` in total.
 * Every submission is confirmed by its own e-mail: a second submission of
 * the same form gets one too, since nothing else proves it came from the
 * address's owner.
 * A submission skipped by a per-address limit is marked handled; one held
 * back by the hourly limit, or whose form file cannot be read, waits.
 */
export const sendDueConfirmations = async ({
  readForm,
  websiteUrl,
  key,
  send = sendWithSmtp,
  limits = DEFAULT_CONFIRMATION_LIMITS,
  now = new Date(),
  log = console,
}: {
  readForm: PublishedFormReader;
  websiteUrl: string;
  key: string;
  send?: (mail: Mail) => Promise<void>;
  limits?: ConfirmationLimits;
  now?: Date;
  log?: Pick<Console, "info" | "warn" | "error">;
}) => {
  const result = { sent: 0, skipped: 0, waiting: 0 };
  const sentLastHour = await prisma.formSubmission.count({
    where: {
      confirmationSentAt: { gt: new Date(now.getTime() - 60 * 60_000) },
    },
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
    take: budget,
    select: {
      id: true,
      submissionId: true,
      teamId: true,
      formId: true,
      locale: true,
      email: true,
      contact: { select: { name: true } },
    },
  });

  for (const submission of due) {
    if (budget <= 0) break;
    const markHandled = () =>
      prisma.formSubmission.update({
        where: { id: submission.id },
        data: { confirmationSentAt: now },
      });
    const email = submission.email?.toLowerCase();
    if (!email) {
      await markHandled();
      result.skipped++;
      continue;
    }
    const toAddress = await prisma.formSubmission.count({
      where: {
        email,
        confirmationSentAt: { gt: new Date(now.getTime() - DAY) },
      },
    });
    if (toAddress >= limits.perAddressPerDay) {
      await markHandled();
      result.skipped++;
      continue;
    }

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
        ),
      });
      await send({
        to: email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      await markHandled();
      result.sent++;
      budget--;
    } catch (error) {
      result.waiting++;
      log.warn(
        error instanceof PublishedFormUnavailableError
          ? "Form confirmation waits for the published form file."
          : "Form confirmation e-mail not sent; retrying on the next round.",
        JSON.stringify({
          formId: submission.formId,
          locale: submission.locale,
        }),
      );
    }
  }
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
