import {
  EmailBatchStatus,
  EmailRecipientStatus,
  type Prisma,
} from "@prisma/client";
import prisma from "@/lib/prisma";

const emailBatchInclude = {
  recipients: {
    orderBy: { createdAt: "asc" },
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.EmailBatchInclude;

type EmailBatchWithRecipients = Prisma.EmailBatchGetPayload<{
  include: typeof emailBatchInclude;
}>;

export type EmailHistoryBatch = {
  id: string;
  teamId: string;
  provider: string;
  subject: string;
  html: string;
  text?: string;
  bccEmails: string[];
  internalCopyMode: string;
  internalCopySentAt?: string;
  senderEmail?: string;
  senderName?: string;
  status: string;
  requestedCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedAt?: string;
  lockedBy?: string;
  startedAt?: string;
  lastError?: string;
  userId?: string;
  userName?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  recipients: Array<{
    id: string;
    contactId?: string;
    contactName?: string;
    contactEmail?: string;
    email: string;
    name?: string;
    status: string;
    providerMessageId?: string;
    errorMessage?: string;
    sentAt?: string;
    createdAt: string;
  }>;
};

const toIso = (value?: Date | null) => value?.toISOString();

const mapEmailBatch = (batch: EmailBatchWithRecipients): EmailHistoryBatch => ({
  id: batch.id,
  teamId: batch.teamId,
  provider: batch.provider,
  subject: batch.subject,
  html: batch.html,
  text: batch.text ?? undefined,
  bccEmails: batch.bccEmails,
  internalCopyMode: batch.internalCopyMode,
  internalCopySentAt: toIso(batch.internalCopySentAt),
  senderEmail: batch.senderEmail ?? undefined,
  senderName: batch.senderName ?? undefined,
  status: batch.status,
  requestedCount: batch.requestedCount,
  sentCount: batch.sentCount,
  skippedCount: batch.skippedCount,
  failedCount: batch.failedCount,
  attempts: batch.attempts,
  maxAttempts: batch.maxAttempts,
  runAfter: batch.runAfter.toISOString(),
  lockedAt: toIso(batch.lockedAt),
  lockedBy: batch.lockedBy ?? undefined,
  startedAt: toIso(batch.startedAt),
  lastError: batch.lastError ?? undefined,
  userId: batch.userId ?? undefined,
  userName: batch.userName ?? undefined,
  createdAt: batch.createdAt.toISOString(),
  updatedAt: batch.updatedAt.toISOString(),
  completedAt: toIso(batch.completedAt),
  recipients: batch.recipients.map((recipient) => ({
    id: recipient.id,
    contactId: recipient.contactId ?? undefined,
    contactName: recipient.contact?.name ?? undefined,
    contactEmail: recipient.contact?.email ?? undefined,
    email: recipient.email,
    name: recipient.name ?? undefined,
    status: recipient.status,
    providerMessageId: recipient.providerMessageId ?? undefined,
    errorMessage: recipient.errorMessage ?? undefined,
    sentAt: toIso(recipient.sentAt),
    createdAt: recipient.createdAt.toISOString(),
  })),
});

export const getEmailHistoryBatches = async (
  teamId: string,
  limit = 50,
): Promise<EmailHistoryBatch[]> => {
  const batches = await prisma.emailBatch.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: emailBatchInclude,
  });

  return batches.map(mapEmailBatch);
};

export const retryEmailBatch = async (teamId: string, batchId: string) =>
  await prisma.$transaction(async (tx) => {
    const batch = await tx.emailBatch.findFirst({
      where: {
        id: batchId,
        teamId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!batch) {
      throw new Error("Email batch not found.");
    }

    if (batch.status === EmailBatchStatus.SENDING) {
      throw new Error("Email batch is already queued or running.");
    }

    if (
      batch.status !== EmailBatchStatus.FAILED &&
      batch.status !== EmailBatchStatus.PARTIAL
    ) {
      throw new Error(
        "Only failed or partially failed email batches can be retried.",
      );
    }

    const retryableRecipients = await tx.emailRecipient.updateMany({
      where: {
        batchId,
        status: {
          in: [EmailRecipientStatus.FAILED, EmailRecipientStatus.BOUNCED],
        },
      },
      data: {
        status: EmailRecipientStatus.PENDING,
        providerMessageId: null,
        errorMessage: null,
        sentAt: null,
      },
    });

    const pendingRecipients = await tx.emailRecipient.count({
      where: {
        batchId,
        status: EmailRecipientStatus.PENDING,
      },
    });

    if (pendingRecipients === 0) {
      throw new Error("This email batch has no failed recipients to retry.");
    }

    const grouped = await tx.emailRecipient.groupBy({
      by: ["status"],
      where: { batchId },
      _count: { _all: true },
    });

    const countFor = (status: EmailRecipientStatus) =>
      grouped.find((entry) => entry.status === status)?._count._all ?? 0;

    const updated = await tx.emailBatch.update({
      where: { id: batchId },
      data: {
        status: EmailBatchStatus.SENDING,
        sentCount:
          countFor(EmailRecipientStatus.SENT) +
          countFor(EmailRecipientStatus.DELIVERED),
        failedCount:
          countFor(EmailRecipientStatus.FAILED) +
          countFor(EmailRecipientStatus.BOUNCED),
        skippedCount: countFor(EmailRecipientStatus.SKIPPED),
        attempts: 0,
        runAfter: new Date(),
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        completedAt: null,
        internalCopySentAt: null,
        lastError: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      retryableRecipients: retryableRecipients.count,
      pendingRecipients,
    };
  });
