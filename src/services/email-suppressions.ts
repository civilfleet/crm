import type { EmailSuppressionReason } from "@prisma/client";
import prisma from "@/lib/prisma";

export const listEmailSuppressions = async (teamId: string) =>
  await prisma.emailSuppression.findMany({
    where: { teamId },
    orderBy: { updatedAt: "desc" },
  });

export const suppressEmail = async ({
  teamId,
  email,
  reason,
  detail,
  userId,
  userName,
}: {
  teamId: string;
  email: string;
  reason: EmailSuppressionReason;
  detail?: string;
  userId: string;
  userName?: string;
}) => {
  const normalizedEmail = email.trim().toLowerCase();
  return await prisma.emailSuppression.upsert({
    where: { teamId_email: { teamId, email: normalizedEmail } },
    create: {
      teamId,
      email: normalizedEmail,
      reason,
      detail: detail?.trim() || null,
      createdByUserId: userId,
      createdByUserName: userName?.trim() || null,
    },
    update: {
      reason,
      detail: detail?.trim() || null,
      createdByUserId: userId,
      createdByUserName: userName?.trim() || null,
      providerMessageId: null,
    },
  });
};

export const removeEmailSuppression = async (
  teamId: string,
  suppressionId: string,
) => {
  const suppression = await prisma.emailSuppression.findFirst({
    where: { id: suppressionId, teamId },
  });
  if (!suppression) {
    throw new Error("Email suppression not found.");
  }
  const removed = await prisma.emailSuppression.deleteMany({
    where: { id: suppressionId, teamId },
  });
  if (removed.count !== 1) {
    throw new Error("Email suppression not found.");
  }
  return suppression;
};
