import type { Prisma } from "@prisma/client";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { deleteFile } from "@/services/file/s3-service";

const DEFAULT_PENDING_UPLOAD_TTL_HOURS = 24;

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

type PendingUploadFileInput = {
  url: string;
  pendingUploadId?: string;
};

const getPendingUploadExpiresAt = () => {
  const ttlHours = Number(
    process.env.PENDING_UPLOAD_TTL_HOURS ?? DEFAULT_PENDING_UPLOAD_TTL_HOURS,
  );
  const normalizedTtlHours =
    Number.isFinite(ttlHours) && ttlHours > 0
      ? ttlHours
      : DEFAULT_PENDING_UPLOAD_TTL_HOURS;

  return new Date(Date.now() + normalizedTtlHours * 60 * 60 * 1000);
};

const createPendingUpload = async ({
  key,
  originalName,
  contentType,
  teamId,
  userId,
}: {
  key: string;
  originalName?: string;
  contentType?: string;
  teamId: string;
  userId: string;
}) => {
  return prisma.pendingUpload.create({
    data: {
      key,
      originalName,
      contentType,
      teamId,
      userId,
      expiresAt: getPendingUploadExpiresAt(),
    },
  });
};

const getPendingUploadIds = (files: PendingUploadFileInput[]) =>
  Array.from(
    new Set(
      files
        .map((file) => file.pendingUploadId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

const assertPendingUploadsAvailable = async ({
  files,
  teamId,
  userId,
  tx,
}: {
  files: PendingUploadFileInput[];
  teamId: string;
  userId: string;
  tx?: Prisma.TransactionClient;
}) => {
  if (files.length === 0) {
    return;
  }

  const missingPendingUpload = files.find((file) => !file.pendingUploadId);
  if (missingPendingUpload) {
    throw new Error("New file uploads must be saved from a pending upload.");
  }

  const pendingUploadIds = getPendingUploadIds(files);
  const client = tx ?? prisma;
  const pendingUploads = await client.pendingUpload.findMany({
    where: {
      id: { in: pendingUploadIds },
      teamId,
      userId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  const pendingUploadsById = new Map(
    pendingUploads.map((upload) => [upload.id, upload]),
  );

  for (const file of files) {
    const pendingUpload = pendingUploadsById.get(file.pendingUploadId ?? "");
    if (!pendingUpload || pendingUpload.key !== file.url) {
      throw new Error("One or more uploaded files are no longer valid.");
    }
  }
};

const consumePendingUploads = async ({
  files,
  teamId,
  userId,
  tx,
}: {
  files: PendingUploadFileInput[];
  teamId: string;
  userId: string;
  tx?: Prisma.TransactionClient;
}) => {
  const pendingUploadIds = getPendingUploadIds(files);
  if (pendingUploadIds.length === 0) {
    return;
  }

  const client = tx ?? prisma;
  await client.pendingUpload.updateMany({
    where: {
      id: { in: pendingUploadIds },
      teamId,
      userId,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });
};

const cleanupExpiredPendingUploads = async ({
  now = new Date(),
  limit = 100,
}: {
  now?: Date;
  limit?: number;
} = {}) => {
  const pendingUploads = await prisma.pendingUpload.findMany({
    where: {
      consumedAt: null,
      expiresAt: { lt: now },
    },
    orderBy: {
      expiresAt: "asc",
    },
    take: limit,
  });

  let deleted = 0;
  let failed = 0;

  for (const pendingUpload of pendingUploads) {
    try {
      await deleteFile(pendingUpload.key);
      await prisma.pendingUpload.delete({
        where: { id: pendingUpload.id },
      });
      deleted += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { error, pendingUploadId: pendingUpload.id, key: pendingUpload.key },
        "Failed to clean up pending upload",
      );
    }
  }

  return {
    scanned: pendingUploads.length,
    deleted,
    failed,
  };
};

export {
  assertPendingUploadsAvailable,
  cleanupExpiredPendingUploads,
  consumePendingUploads,
  createPendingUpload,
};
