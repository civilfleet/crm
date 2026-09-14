import {
  type EmailBatch,
  EmailBatchStatus,
  EmailRecipientStatus,
  IntegrationProvider as PrismaIntegrationProvider,
} from "@prisma/client";
import {
  DEFAULT_INTERNAL_COPY_MODE,
  INTERNAL_COPY_MODE_LABELS,
  type InternalCopyMode,
} from "@/constants/email";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import {
  getPrimaryEmail,
  primaryContactEmailSelect,
} from "@/services/contact-emails";
import {
  EngagementDirection,
  EngagementSource,
  type IntegrationConnection,
  IntegrationProvider,
} from "@/types";

const DEFAULT_REGION = "fr-par";
const EXTERNAL_SOURCE = "SCALEWAY_TEM";
const MAX_RECIPIENTS = 100;
const DEFAULT_RETRY_DELAY_SECONDS = 30;
const MAX_RETRY_DELAY_SECONDS = 15 * 60;
const SENDER_LABEL_MODES = ["default", "user"] as const;

export type SenderLabelMode = (typeof SENDER_LABEL_MODES)[number];

type ScalewayEmailRecord = {
  id?: string;
  status?: string;
};

export type ScalewayEmailIntegrationSettings = IntegrationConnection & {
  hasApiKey: boolean;
  apiKeyPreview?: string;
  connectionVerified?: boolean;
  connectionMessage?: string;
  region?: string;
  projectId?: string;
};

export type SendMassEmailInput = {
  teamId: string;
  contactIds?: string[];
  eventIds?: string[];
  subject: string;
  html: string;
  bccEmails?: string[];
  internalCopyMode?: InternalCopyMode;
  userId?: string;
  userName?: string;
  senderLabelMode?: SenderLabelMode;
};

export type SendMassEmailResult = {
  batchId: string;
  requested: number;
  sent: number;
  skipped: number;
  failed: number;
  failures: Array<{
    contactId: string;
    email?: string;
    message: string;
  }>;
};

const maskApiKey = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  if (value.length <= 8) {
    return "****";
  }
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
};

const stripHtml = (html: string) =>
  html
    .replace(/<(br|p|div|section|article)[^>]*>/gi, "\n")
    .replace(/<\/(p|div|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n+\s*\n+/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type EmailPlaceholderContact = {
  name?: string | null;
  email?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
};

const getFirstName = (name?: string | null) =>
  name?.trim().split(/\s+/)[0] ?? "";

const renderEmailPlaceholders = (
  value: string,
  contact: EmailPlaceholderContact,
  options: { escape?: boolean } = {},
) => {
  const replacements: Record<string, string> = {
    "contact.name": contact.name?.trim() ?? "",
    "contact.firstName": getFirstName(contact.name),
    "contact.email": contact.email?.trim() ?? "",
    "contact.city": contact.city?.trim() ?? "",
    "contact.country": contact.country?.trim() ?? "",
    "contact.phone": contact.phone?.trim() ?? "",
  };

  return value.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key) => {
    const replacement = replacements[key];
    if (replacement === undefined) {
      return match;
    }

    return options.escape === false ? replacement : escapeHtml(replacement);
  });
};

const getRetryDelayMs = (attempts: number) => {
  const delaySeconds = Math.min(
    DEFAULT_RETRY_DELAY_SECONDS * 2 ** Math.max(attempts - 1, 0),
    MAX_RETRY_DELAY_SECONDS,
  );

  return delaySeconds * 1000;
};

const parseScalewayResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
};

const assertOkResponse = async (response: Response, fallback: string) => {
  if (response.ok) {
    return;
  }

  const body = await parseScalewayResponse(response);
  const message =
    (typeof body.message === "string" && body.message) ||
    (typeof body.error === "string" && body.error) ||
    fallback;
  throw new Error(message);
};

const buildSender = (settings: {
  senderEmail?: string | null;
  senderName?: string | null;
}) => {
  const email = settings.senderEmail?.trim();
  if (!email) {
    throw new Error("Default sender email is required.");
  }

  const name = settings.senderName?.trim();
  return name ? { email, name } : { email };
};

const sendScalewayEmail = async ({
  apiKey,
  region,
  projectId,
  from,
  to,
  subject,
  text,
  html,
  additionalHeaders,
}: {
  apiKey: string;
  region: string;
  projectId: string;
  from: { email: string; name?: string };
  to: { email: string; name?: string };
  subject: string;
  text?: string;
  html: string;
  additionalHeaders?: Array<{ key: string; value: string }>;
}) => {
  const response = await fetch(
    `https://api.scaleway.com/transactional-email/v1alpha1/regions/${region}/emails`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": apiKey,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: text ?? stripHtml(html),
        html,
        project_id: projectId,
        additional_headers: additionalHeaders,
      }),
    },
  );

  await assertOkResponse(response, "Scaleway Transactional Email send failed.");
  const body = await parseScalewayResponse(response);
  const record =
    body.email ??
    (Array.isArray(body.emails) ? body.emails[0] : undefined) ??
    body;
  return record as ScalewayEmailRecord;
};

export const sendScalewayTransactionalEmail = async ({
  teamId,
  from,
  to,
  subject,
  text,
  html,
  additionalHeaders,
}: {
  teamId: string;
  from: { email: string; name?: string };
  to: { email: string; name?: string };
  subject: string;
  text: string;
  html: string;
  additionalHeaders?: Array<{ key: string; value: string }>;
}) => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      },
    },
  });

  if (
    !integration?.isEnabled ||
    !integration.apiKey ||
    !integration.defaultListId
  ) {
    throw new Error(
      "The Scaleway Transactional Email integration is not configured or enabled.",
    );
  }

  const result = await sendScalewayEmail({
    apiKey: integration.apiKey,
    region: integration.baseUrl ?? DEFAULT_REGION,
    projectId: integration.defaultListId,
    from,
    to,
    subject,
    text,
    html,
    additionalHeaders,
  });

  return {
    id: result.id,
    messageId:
      "message_id" in result && typeof result.message_id === "string"
        ? result.message_id
        : undefined,
  };
};

type InternalCopyRecipient = {
  email: string;
  name: string | null;
  status: EmailRecipientStatus;
  errorMessage: string | null;
  sentAt: Date | null;
  contact: {
    name: string | null;
    email: string | null;
  } | null;
};

type InternalCopyStats = {
  status: EmailBatchStatus;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
};

const formatInternalCopyDate = (value?: Date | null) =>
  value?.toISOString() ?? "-";

const buildInternalCopyHtml = ({
  batch,
  recipients,
  stats,
}: {
  batch: EmailBatch;
  recipients: InternalCopyRecipient[];
  stats: InternalCopyStats;
}) => {
  const internalCopyMode: InternalCopyMode =
    batch.internalCopyMode === "summary_with_recipients"
      ? "summary_with_recipients"
      : DEFAULT_INTERNAL_COPY_MODE;
  const shouldIncludeRecipients =
    internalCopyMode === "summary_with_recipients";
  const sender = batch.senderName
    ? `${batch.senderName} <${batch.senderEmail ?? ""}>`
    : batch.senderEmail || "-";
  const metadataRows = [
    ["Subject", batch.subject],
    ["Status", stats.status],
    ["Sent by", batch.userName || "-"],
    ["From", sender],
    ["Created at", formatInternalCopyDate(batch.createdAt)],
    ["Requested", String(batch.requestedCount)],
    ["Sent", String(stats.sentCount)],
    ["Failed", String(stats.failedCount)],
    ["Skipped", String(stats.skippedCount)],
    ["Copy content", INTERNAL_COPY_MODE_LABELS[internalCopyMode]],
  ];

  const metadataHtml = metadataRows
    .map(
      ([label, value]) => `
        <tr>
          <th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; width: 180px;">${escapeHtml(label)}</th>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(value)}</td>
        </tr>
      `,
    )
    .join("");

  const recipientListHtml = shouldIncludeRecipients
    ? `
      <h2 style="margin: 24px 0 8px; font-size: 16px;">Recipients</h2>
      <p style="margin: 0 0 12px; color: #4b5563;">This internal copy includes the full recipient list for the batch.</p>
      <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
        <thead>
          <tr>
            <th style="padding: 8px 10px; text-align: left; border-bottom: 1px solid #d1d5db;">Name</th>
            <th style="padding: 8px 10px; text-align: left; border-bottom: 1px solid #d1d5db;">Email</th>
            <th style="padding: 8px 10px; text-align: left; border-bottom: 1px solid #d1d5db;">Status</th>
            <th style="padding: 8px 10px; text-align: left; border-bottom: 1px solid #d1d5db;">Sent at</th>
            <th style="padding: 8px 10px; text-align: left; border-bottom: 1px solid #d1d5db;">Error</th>
          </tr>
        </thead>
        <tbody>
          ${recipients
            .map((recipient) => {
              const name = recipient.name || recipient.contact?.name || "-";
              const email = recipient.email || recipient.contact?.email || "-";
              return `
                <tr>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(name)}</td>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(email)}</td>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(recipient.status)}</td>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(formatInternalCopyDate(recipient.sentAt))}</td>
                  <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6;">${escapeHtml(recipient.errorMessage || "-")}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `
    : `
      <p style="margin: 24px 0 0; color: #4b5563;">
        This internal copy does not include the recipient list.
      </p>
    `;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; line-height: 1.5;">
      <h1 style="margin: 0 0 12px; font-size: 20px;">Internal copy of CRM email batch</h1>
      <p style="margin: 0 0 16px; color: #4b5563;">
        This is one batch-level copy. Individual recipients received separately rendered emails.
      </p>
      <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        <tbody>${metadataHtml}</tbody>
      </table>
      ${recipientListHtml}
      <h2 style="margin: 24px 0 8px; font-size: 16px;">Original email template</h2>
      <p style="margin: 0 0 12px; color: #4b5563;">
        Contact placeholders are shown as the original template, not as any one recipient's personalized copy.
      </p>
      <div style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px;">
        ${batch.html}
      </div>
    </div>
  `;
};

const sendInternalCopyEmails = async ({
  batch,
  integration,
  from,
  region,
  recipients,
  stats,
}: {
  batch: EmailBatch;
  integration: { apiKey: string; defaultListId: string };
  from: { email: string; name?: string };
  region: string;
  recipients: InternalCopyRecipient[];
  stats: InternalCopyStats;
}) => {
  const html = buildInternalCopyHtml({ batch, recipients, stats });
  const subject = `Internal copy: ${batch.subject}`;

  for (const internalCopyEmail of batch.bccEmails) {
    try {
      await sendScalewayEmail({
        apiKey: integration.apiKey,
        region,
        projectId: integration.defaultListId,
        from,
        to: { email: internalCopyEmail },
        subject,
        html,
      });
    } catch (error) {
      logger.error(
        {
          teamId: batch.teamId,
          batchId: batch.id,
          internalCopyEmail,
          error,
        },
        "Scaleway internal copy failed",
      );
    }
  }
};

export const getScalewayEmailIntegration = async (
  teamId: string,
): Promise<ScalewayEmailIntegrationSettings | null> => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      },
    },
  });

  if (!integration) {
    return null;
  }

  return {
    id: integration.id,
    teamId: integration.teamId,
    provider: IntegrationProvider.SCALEWAY_TEM,
    region: integration.baseUrl ?? DEFAULT_REGION,
    projectId: integration.defaultListId ?? undefined,
    senderEmail: integration.senderEmail ?? undefined,
    senderName: integration.senderName ?? undefined,
    isEnabled: integration.isEnabled,
    lastSyncedAt: integration.lastSyncedAt ?? undefined,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
    hasApiKey: Boolean(integration.apiKey),
    apiKeyPreview: maskApiKey(integration.apiKey),
    connectionVerified:
      Boolean(integration.apiKey) &&
      Boolean(integration.defaultListId) &&
      Boolean(integration.senderEmail) &&
      integration.isEnabled,
  };
};

export const saveScalewayEmailIntegration = async ({
  teamId,
  apiKey,
  region,
  projectId,
  senderEmail,
  senderName,
  isEnabled,
}: {
  teamId: string;
  apiKey?: string;
  region?: string;
  projectId?: string;
  senderEmail?: string;
  senderName?: string;
  isEnabled?: boolean;
}): Promise<ScalewayEmailIntegrationSettings> => {
  const existing = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      },
    },
  });

  const apiKeyToPersist = apiKey?.trim() || existing?.apiKey;
  const projectIdToPersist = projectId?.trim() || existing?.defaultListId;
  const senderEmailToPersist =
    senderEmail?.trim().toLowerCase() || existing?.senderEmail;

  if (!apiKeyToPersist) {
    throw new Error("Scaleway secret key is required.");
  }
  if (!projectIdToPersist) {
    throw new Error("Scaleway project ID is required.");
  }
  if (!senderEmailToPersist) {
    throw new Error("Default sender email is required.");
  }

  const record = await prisma.integrationConnection.upsert({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      },
    },
    update: {
      apiKey: apiKeyToPersist,
      baseUrl: region?.trim() || existing?.baseUrl || DEFAULT_REGION,
      defaultListId: projectIdToPersist,
      senderEmail: senderEmailToPersist,
      senderName: senderName?.trim() || null,
      isEnabled: isEnabled ?? existing?.isEnabled ?? true,
    },
    create: {
      teamId,
      provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      apiKey: apiKeyToPersist,
      baseUrl: region?.trim() || DEFAULT_REGION,
      defaultListId: projectIdToPersist,
      senderEmail: senderEmailToPersist,
      senderName: senderName?.trim() || null,
      isEnabled: isEnabled ?? true,
    },
  });

  return {
    id: record.id,
    teamId: record.teamId,
    provider: IntegrationProvider.SCALEWAY_TEM,
    region: record.baseUrl ?? DEFAULT_REGION,
    projectId: record.defaultListId ?? undefined,
    senderEmail: record.senderEmail ?? undefined,
    senderName: record.senderName ?? undefined,
    isEnabled: record.isEnabled,
    lastSyncedAt: record.lastSyncedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    hasApiKey: Boolean(record.apiKey),
    apiKeyPreview: maskApiKey(record.apiKey),
    connectionVerified: true,
    connectionMessage: "Scaleway Transactional Email settings saved.",
  };
};

export const sendMassEmailToContacts = async ({
  teamId,
  contactIds = [],
  eventIds = [],
  subject,
  html,
  bccEmails = [],
  internalCopyMode = DEFAULT_INTERNAL_COPY_MODE,
  userId,
  userName,
  senderLabelMode = "default",
}: SendMassEmailInput): Promise<SendMassEmailResult> => {
  const uniqueDirectContactIds = Array.from(new Set(contactIds));
  const uniqueEventIds = Array.from(new Set(eventIds));
  const normalizedBccEmails = Array.from(
    new Set(
      bccEmails.map((email) => email.trim().toLowerCase()).filter(Boolean),
    ),
  );

  if (uniqueDirectContactIds.length === 0 && uniqueEventIds.length === 0) {
    throw new Error("Select at least one recipient.");
  }

  const eventRegistrantContactIds =
    uniqueEventIds.length > 0
      ? await prisma.eventRegistration.findMany({
          where: {
            eventId: { in: uniqueEventIds },
            event: { teamId },
          },
          select: {
            contactId: true,
          },
        })
      : [];
  const uniqueContactIds = Array.from(
    new Set([
      ...uniqueDirectContactIds,
      ...eventRegistrantContactIds.map(
        (registration) => registration.contactId,
      ),
    ]),
  );

  if (uniqueContactIds.length === 0) {
    throw new Error("No email recipients found for this selection.");
  }
  if (uniqueContactIds.length > MAX_RECIPIENTS) {
    throw new Error(
      `You can send to at most ${MAX_RECIPIENTS} contacts at once.`,
    );
  }

  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId,
        provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      },
    },
  });

  if (!integration?.apiKey || !integration.defaultListId) {
    throw new Error("Scaleway Transactional Email is not configured.");
  }
  if (!integration.isEnabled) {
    throw new Error("Scaleway Transactional Email is disabled.");
  }

  const contacts = await prisma.contact.findMany({
    where: {
      teamId,
      id: { in: uniqueContactIds },
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      emails: primaryContactEmailSelect,
    },
  });

  const from = buildSender({
    senderEmail: integration.senderEmail,
    senderName:
      senderLabelMode === "user"
        ? userName?.trim() || integration.senderName
        : integration.senderName,
  });
  const batch = await prisma.emailBatch.create({
    data: {
      teamId,
      provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      subject,
      html,
      text: stripHtml(html),
      bccEmails: normalizedBccEmails,
      internalCopyMode,
      senderEmail: from.email,
      senderName: from.name,
      requestedCount: uniqueContactIds.length,
      userId,
      userName,
    },
  });

  const failures: SendMassEmailResult["failures"] = [];
  let skipped = 0;

  for (const contact of contacts) {
    const email = getPrimaryEmail(contact)?.trim().toLowerCase();
    if (!email) {
      skipped += 1;
      await prisma.emailRecipient.create({
        data: {
          batchId: batch.id,
          contactId: contact.id,
          email: "missing-email",
          name: contact.name,
          status: EmailRecipientStatus.SKIPPED,
          errorMessage: "Contact has no email address.",
        },
      });
      failures.push({
        contactId: contact.id,
        message: "Contact has no email address.",
      });
      continue;
    }

    await prisma.emailRecipient.create({
      data: {
        batchId: batch.id,
        contactId: contact.id,
        email,
        name: contact.name,
        status: EmailRecipientStatus.PENDING,
      },
    });
  }

  const missingContacts = uniqueContactIds.length - contacts.length;
  if (missingContacts > 0) {
    skipped += missingContacts;
  }

  if (skipped > 0) {
    await prisma.emailBatch.update({
      where: { id: batch.id },
      data: { skippedCount: skipped },
    });
  }

  return {
    batchId: batch.id,
    requested: uniqueContactIds.length,
    sent: 0,
    skipped,
    failed: 0,
    failures: failures.slice(0, 10),
  };
};

export const claimNextEmailBatch = async (workerId: string) =>
  await prisma.$transaction(async (tx) => {
    const batches = await tx.$queryRaw<EmailBatch[]>`
      SELECT *
      FROM "EmailBatch"
      WHERE "status" = 'SENDING'::"EmailBatchStatus"
        AND "runAfter" <= now()
        AND "lockedAt" IS NULL
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;

    const batch = batches[0];
    if (!batch) {
      return null;
    }

    return await tx.emailBatch.update({
      where: { id: batch.id },
      data: {
        attempts: { increment: 1 },
        lockedAt: new Date(),
        lockedBy: workerId,
        startedAt: batch.startedAt ?? new Date(),
        lastError: null,
      },
    });
  });

export const recoverStaleEmailBatches = async (staleAfterMs: number) => {
  const cutoff = new Date(Date.now() - staleAfterMs);

  return await prisma.emailBatch.updateMany({
    where: {
      status: EmailBatchStatus.SENDING,
      lockedAt: { lt: cutoff },
    },
    data: {
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(),
      lastError: "Recovered stale worker lock.",
    },
  });
};

export const markEmailBatchFailed = async (
  batch: EmailBatch,
  error: unknown,
) => {
  const message = error instanceof Error ? error.message : String(error);
  const willRetry = batch.attempts < batch.maxAttempts;

  return await prisma.emailBatch.update({
    where: { id: batch.id },
    data: {
      status: willRetry ? EmailBatchStatus.SENDING : EmailBatchStatus.FAILED,
      runAfter: willRetry
        ? new Date(Date.now() + getRetryDelayMs(batch.attempts))
        : batch.runAfter,
      lockedAt: null,
      lockedBy: null,
      completedAt: willRetry ? null : new Date(),
      lastError: message,
    },
  });
};

export const processEmailBatch = async (batch: EmailBatch) => {
  const integration = await prisma.integrationConnection.findUnique({
    where: {
      teamId_provider: {
        teamId: batch.teamId,
        provider: PrismaIntegrationProvider.SCALEWAY_TEM,
      },
    },
  });

  if (!integration?.apiKey || !integration.defaultListId) {
    throw new Error("Scaleway Transactional Email is not configured.");
  }
  if (!integration.isEnabled) {
    throw new Error("Scaleway Transactional Email is disabled.");
  }

  const from = buildSender({
    senderEmail: batch.senderEmail ?? integration.senderEmail,
    senderName: batch.senderName ?? integration.senderName,
  });
  const region = integration.baseUrl || DEFAULT_REGION;
  const pendingRecipients = await prisma.emailRecipient.findMany({
    where: {
      batchId: batch.id,
      status: EmailRecipientStatus.PENDING,
    },
    include: {
      contact: {
        select: {
          name: true,
          emails: primaryContactEmailSelect,
          city: true,
          country: true,
          phone: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const recipient of pendingRecipients) {
    try {
      const placeholderContact = {
        name: recipient.name ?? recipient.contact?.name,
        email: recipient.email ?? getPrimaryEmail(recipient.contact),
        city: recipient.contact?.city,
        country: recipient.contact?.country,
        phone: recipient.contact?.phone,
      };
      const renderedSubject = renderEmailPlaceholders(
        batch.subject,
        placeholderContact,
        { escape: false },
      );
      const renderedHtml = renderEmailPlaceholders(
        batch.html,
        placeholderContact,
      );
      const scalewayEmail = await sendScalewayEmail({
        apiKey: integration.apiKey,
        region,
        projectId: integration.defaultListId,
        from,
        to: { email: recipient.email, name: recipient.name ?? undefined },
        subject: renderedSubject,
        html: renderedHtml,
      });

      const sentAt = new Date();
      await prisma.emailRecipient.update({
        where: { id: recipient.id },
        data: {
          status: EmailRecipientStatus.SENT,
          providerMessageId: scalewayEmail.id,
          sentAt,
          errorMessage: null,
        },
      });

      if (recipient.contactId) {
        await prisma.contactEngagement.create({
          data: {
            contactId: recipient.contactId,
            teamId: batch.teamId,
            direction: EngagementDirection.OUTBOUND,
            source: EngagementSource.EMAIL,
            subject: renderedSubject,
            message: renderedHtml,
            userId: batch.userId,
            userName: batch.userName,
            externalId: scalewayEmail.id,
            externalSource: EXTERNAL_SOURCE,
            engagedAt: sentAt,
          },
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Email delivery failed.";
      logger.error(
        {
          teamId: batch.teamId,
          batchId: batch.id,
          recipientId: recipient.id,
          email: recipient.email,
          error,
        },
        "Scaleway email recipient failed",
      );
      await prisma.emailRecipient.update({
        where: { id: recipient.id },
        data: {
          status: EmailRecipientStatus.FAILED,
          errorMessage: message,
        },
      });
    }
  }

  const grouped = await prisma.emailRecipient.groupBy({
    by: ["status"],
    where: { batchId: batch.id },
    _count: { _all: true },
  });

  const countFor = (status: EmailRecipientStatus) =>
    grouped.find((entry) => entry.status === status)?._count._all ?? 0;
  const sentCount =
    countFor(EmailRecipientStatus.SENT) +
    countFor(EmailRecipientStatus.DELIVERED);
  const failedCount =
    countFor(EmailRecipientStatus.FAILED) +
    countFor(EmailRecipientStatus.BOUNCED);
  const skippedCount = countFor(EmailRecipientStatus.SKIPPED);
  const pendingCount = countFor(EmailRecipientStatus.PENDING);

  const status =
    pendingCount > 0
      ? EmailBatchStatus.SENDING
      : sentCount > 0 && failedCount === 0 && skippedCount === 0
        ? EmailBatchStatus.SENT
        : sentCount > 0
          ? EmailBatchStatus.PARTIAL
          : EmailBatchStatus.FAILED;
  const internalCopySentAt =
    pendingCount === 0 &&
    sentCount > 0 &&
    batch.bccEmails.length > 0 &&
    !batch.internalCopySentAt
      ? new Date()
      : undefined;

  if (internalCopySentAt) {
    const recipients = await prisma.emailRecipient.findMany({
      where: { batchId: batch.id },
      orderBy: { createdAt: "asc" },
      select: {
        email: true,
        name: true,
        status: true,
        errorMessage: true,
        sentAt: true,
        contact: {
          select: {
            name: true,
            emails: primaryContactEmailSelect,
          },
        },
      },
    });

    await sendInternalCopyEmails({
      batch,
      integration: {
        apiKey: integration.apiKey,
        defaultListId: integration.defaultListId,
      },
      from,
      region,
      recipients: recipients.map((recipient) => ({
        ...recipient,
        contact: recipient.contact
          ? {
              name: recipient.contact.name,
              email: getPrimaryEmail(recipient.contact) ?? null,
            }
          : null,
      })),
      stats: {
        status,
        sentCount,
        failedCount,
        skippedCount,
      },
    });
  }

  const updated = await prisma.emailBatch.update({
    where: { id: batch.id },
    data: {
      status,
      sentCount,
      failedCount,
      skippedCount,
      lockedAt: null,
      lockedBy: null,
      completedAt: pendingCount > 0 ? null : new Date(),
      internalCopySentAt,
      lastError: null,
    },
  });

  return {
    batchId: updated.id,
    status: updated.status,
    sent: sentCount,
    failed: failedCount,
    skipped: skippedCount,
    pending: pendingCount,
  };
};
