import {
  EmailBatchStatus,
  EmailRecipientStatus,
  EmailSuppressionReason,
  IntegrationProvider,
  type Prisma,
} from "@prisma/client";
import prisma from "@/lib/prisma";

const DELIVERY_TYPES = new Set(["email_delivered"]);
const HARD_BOUNCE_TYPES = new Set([
  "email_dropped",
  "email_mailbox_not_found",
  "email_blocklisted",
]);
const SPAM_TYPES = new Set(["email_spam"]);
const SUPPORTED_TYPES = new Set([
  ...DELIVERY_TYPES,
  ...HARD_BOUNCE_TYPES,
  ...SPAM_TYPES,
  "email_queued",
  "email_deferred",
  "blocklist_created",
]);

export type ScalewayEmailEvent = {
  id: string;
  type: string;
  project_id: string;
  email_id?: string;
  email_to?: string;
  created_at?: string;
  email_response_code?: number;
  email_response_message?: string;
  email_error?: string;
  [key: string]: unknown;
};

const requiredString = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value) {
    throw new Error(`Invalid Scaleway email event ${field}.`);
  }
  return value;
};

export const parseScalewayEmailEvent = (
  message: string,
): ScalewayEmailEvent => {
  let value: unknown;
  try {
    value = JSON.parse(message);
  } catch {
    throw new Error("Scaleway email event Message is not valid JSON.");
  }
  if (!value || typeof value !== "object") {
    throw new Error("Invalid Scaleway email event payload.");
  }
  const input = value as Record<string, unknown>;
  const type = requiredString(input.type, "type");
  if (!SUPPORTED_TYPES.has(type)) {
    throw new Error(`Unsupported Scaleway email event type: ${type}.`);
  }
  return {
    ...input,
    id: requiredString(input.id, "id"),
    type,
    project_id: requiredString(input.project_id, "project_id"),
    email_id: typeof input.email_id === "string" ? input.email_id : undefined,
    email_to:
      typeof input.email_to === "string"
        ? input.email_to.trim().toLowerCase()
        : undefined,
    created_at:
      typeof input.created_at === "string" ? input.created_at : undefined,
    email_response_code:
      typeof input.email_response_code === "number"
        ? input.email_response_code
        : undefined,
    email_response_message:
      typeof input.email_response_message === "string"
        ? input.email_response_message
        : undefined,
    email_error:
      typeof input.email_error === "string" ? input.email_error : undefined,
  };
};

const getEventError = (event: ScalewayEmailEvent) =>
  event.email_response_message ||
  event.email_error ||
  (event.email_response_code
    ? `Provider response ${event.email_response_code}`
    : `Scaleway reported ${event.type}.`);

const getSuppressionReason = (event: ScalewayEmailEvent) => {
  if (SPAM_TYPES.has(event.type)) return EmailSuppressionReason.SPAM;
  if (HARD_BOUNCE_TYPES.has(event.type) || event.type === "blocklist_created") {
    return EmailSuppressionReason.HARD_BOUNCE;
  }
  return null;
};

const recalculateBatch = async (
  tx: Prisma.TransactionClient,
  batchId: string,
) => {
  const grouped = await tx.emailRecipient.groupBy({
    by: ["status"],
    where: { batchId },
    _count: { _all: true },
  });
  const countFor = (status: EmailRecipientStatus) =>
    grouped.find((entry) => entry.status === status)?._count._all ?? 0;
  const sentCount =
    countFor(EmailRecipientStatus.SENT) +
    countFor(EmailRecipientStatus.DELIVERED);
  const failedCount =
    countFor(EmailRecipientStatus.FAILED) +
    countFor(EmailRecipientStatus.BOUNCED) +
    countFor(EmailRecipientStatus.UNKNOWN);
  const skippedCount = countFor(EmailRecipientStatus.SKIPPED);

  await tx.emailBatch.update({
    where: { id: batchId },
    data: {
      status:
        failedCount > 0 || skippedCount > 0
          ? EmailBatchStatus.PARTIAL
          : EmailBatchStatus.SENT,
      sentCount,
      failedCount,
      skippedCount,
    },
  });
};

export const applyScalewayEmailEvent = async (event: ScalewayEmailEvent) => {
  const recipient = event.email_id
    ? await prisma.emailRecipient.findFirst({
        where: {
          providerMessageId: event.email_id,
        },
        select: {
          id: true,
          batchId: true,
          email: true,
          batch: { select: { teamId: true } },
        },
      })
    : null;
  const internalCopy =
    !recipient && event.email_id
      ? await prisma.emailInternalCopyRecipient.findFirst({
          where: {
            providerMessageId: event.email_id,
          },
          select: {
            id: true,
            batchId: true,
            email: true,
            batch: { select: { teamId: true } },
          },
        })
      : null;

  if (event.email_id && !recipient && !internalCopy) {
    throw new Error("Scaleway event does not match a CRM email recipient.");
  }
  const matchedTeamId = recipient?.batch.teamId ?? internalCopy?.batch.teamId;
  const integrations = await prisma.integrationConnection.findMany({
    where: {
      provider: IntegrationProvider.SCALEWAY_TEM,
      defaultListId: event.project_id,
      isEnabled: true,
      teamId: matchedTeamId,
    },
    select: { teamId: true },
    take: 2,
  });
  if (integrations.length !== 1) {
    throw new Error(
      integrations.length === 0
        ? "Scaleway event project is not configured for the matching team."
        : "Scaleway event project maps to multiple CRM teams.",
    );
  }
  const teamId = integrations[0].teamId;
  const matchedEmail = recipient?.email ?? internalCopy?.email;
  if (
    matchedEmail &&
    event.email_to &&
    matchedEmail.trim().toLowerCase() !== event.email_to
  ) {
    throw new Error("Scaleway event recipient does not match the CRM record.");
  }
  if (!matchedEmail && !event.email_to) {
    throw new Error("Scaleway event has no recipient email.");
  }

  const occurredAt = event.created_at ? new Date(event.created_at) : undefined;
  if (occurredAt && !Number.isFinite(occurredAt.getTime())) {
    throw new Error("Scaleway email event has an invalid created_at value.");
  }
  const suppressionReason = getSuppressionReason(event);
  const errorMessage = getEventError(event);

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.emailDeliveryEvent.findUnique({
      where: { eventId: event.id },
      select: { eventId: true },
    });
    if (existing) return { duplicate: true, type: event.type };

    await tx.emailDeliveryEvent.create({
      data: {
        eventId: event.id,
        teamId,
        providerMessageId: event.email_id ?? `blocklist:${event.email_to}`,
        type: event.type,
        payload: event as Prisma.InputJsonValue,
        occurredAt,
      },
    });

    let statusChanged = false;
    const nextStatus = DELIVERY_TYPES.has(event.type)
      ? EmailRecipientStatus.DELIVERED
      : suppressionReason
        ? EmailRecipientStatus.BOUNCED
        : null;
    if (recipient && nextStatus) {
      const update = await tx.emailRecipient.updateMany({
        where: {
          id: recipient.id,
          status: DELIVERY_TYPES.has(event.type)
            ? EmailRecipientStatus.SENT
            : {
                in: [EmailRecipientStatus.SENT, EmailRecipientStatus.DELIVERED],
              },
        },
        data: {
          status: nextStatus,
          errorMessage: suppressionReason ? errorMessage : null,
        },
      });
      statusChanged = update.count === 1;
    } else if (internalCopy && nextStatus) {
      const update = await tx.emailInternalCopyRecipient.updateMany({
        where: {
          id: internalCopy.id,
          status: DELIVERY_TYPES.has(event.type)
            ? EmailRecipientStatus.SENT
            : {
                in: [EmailRecipientStatus.SENT, EmailRecipientStatus.DELIVERED],
              },
        },
        data: {
          status: nextStatus,
          errorMessage: suppressionReason ? errorMessage : null,
        },
      });
      statusChanged = update.count === 1;
    }

    if (suppressionReason) {
      const email = (event.email_to ?? matchedEmail) as string;
      await tx.emailSuppression.upsert({
        where: {
          teamId_email: { teamId, email },
        },
        create: {
          teamId,
          email,
          reason: suppressionReason,
          detail: errorMessage,
          providerMessageId: event.email_id,
        },
        update: {
          reason: suppressionReason,
          detail: errorMessage,
          providerMessageId: event.email_id,
        },
      });
    }

    if (recipient && statusChanged) {
      await recalculateBatch(tx, recipient.batchId);
    }

    return {
      duplicate: false,
      type: event.type,
      statusChanged,
      suppressed: Boolean(suppressionReason),
    };
  });
};
