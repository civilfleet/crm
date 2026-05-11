import type { Prisma } from "@prisma/client";
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
  senderEmail?: string;
  senderName?: string;
  status: string;
  requestedCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
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

const mapEmailBatch = (
  batch: EmailBatchWithRecipients,
): EmailHistoryBatch => ({
  id: batch.id,
  teamId: batch.teamId,
  provider: batch.provider,
  subject: batch.subject,
  html: batch.html,
  text: batch.text ?? undefined,
  senderEmail: batch.senderEmail ?? undefined,
  senderName: batch.senderName ?? undefined,
  status: batch.status,
  requestedCount: batch.requestedCount,
  sentCount: batch.sentCount,
  skippedCount: batch.skippedCount,
  failedCount: batch.failedCount,
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
