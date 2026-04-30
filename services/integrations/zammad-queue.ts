import {
  Prisma,
  ZammadSyncJobStatus,
  ZammadSyncJobType,
  type ZammadSyncJob,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

const ACTIVE_JOB_STATUSES = [
  ZammadSyncJobStatus.PENDING,
  ZammadSyncJobStatus.RUNNING,
];

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_SECONDS = 30;
const MAX_RETRY_DELAY_SECONDS = 15 * 60;

type EnqueueZammadSyncJobOptions = {
  fullSync?: boolean;
};

type EnqueueZammadTicketSyncJobOptions = {
  teamId: string;
  ticketId: number;
};

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const getRetryDelayMs = (attempts: number) => {
  const delaySeconds = Math.min(
    DEFAULT_RETRY_DELAY_SECONDS * 2 ** Math.max(attempts - 1, 0),
    MAX_RETRY_DELAY_SECONDS,
  );

  return delaySeconds * 1000;
};

const findActiveJob = async ({
  teamId,
  type,
  ticketId,
}: {
  teamId: string;
  type: ZammadSyncJobType;
  ticketId?: number | null;
}) =>
  await prisma.zammadSyncJob.findFirst({
    where: {
      teamId,
      type,
      ticketId: ticketId ?? null,
      status: { in: ACTIVE_JOB_STATUSES },
    },
    orderBy: { createdAt: "asc" },
  });

export const enqueueZammadSyncJob = async (
  teamId: string,
  { fullSync = false }: EnqueueZammadSyncJobOptions = {},
) => {
  const type = fullSync
    ? ZammadSyncJobType.FULL_SYNC
    : ZammadSyncJobType.INCREMENTAL_SYNC;

  const activeJob = await findActiveJob({ teamId, type, ticketId: null });
  if (activeJob) {
    logger.debug(
      { teamId, jobId: activeJob.id, type },
      "[Zammad] Sync job already queued",
    );
    return activeJob;
  }

  return await prisma.zammadSyncJob.create({
    data: {
      teamId,
      type,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      payload: toJsonValue({ fullSync }),
    },
  });
};

export const enqueueZammadTicketSyncJob = async ({
  teamId,
  ticketId,
}: EnqueueZammadTicketSyncJobOptions) => {
  const activeJob = await findActiveJob({
    teamId,
    type: ZammadSyncJobType.TICKET_SYNC,
    ticketId,
  });
  if (activeJob) {
    logger.debug(
      { teamId, jobId: activeJob.id, ticketId },
      "[Zammad] Ticket sync job already queued",
    );
    return activeJob;
  }

  return await prisma.zammadSyncJob.create({
    data: {
      teamId,
      type: ZammadSyncJobType.TICKET_SYNC,
      ticketId,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      payload: toJsonValue({ ticketId }),
    },
  });
};

export const claimNextZammadSyncJob = async (workerId: string) =>
  await prisma.$transaction(async (tx) => {
    const jobs = await tx.$queryRaw<ZammadSyncJob[]>`
      SELECT *
      FROM "ZammadSyncJob"
      WHERE "status" = 'PENDING'::"ZammadSyncJobStatus"
        AND "runAfter" <= now()
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;

    const job = jobs[0];
    if (!job) {
      return null;
    }

    return await tx.zammadSyncJob.update({
      where: { id: job.id },
      data: {
        status: ZammadSyncJobStatus.RUNNING,
        attempts: { increment: 1 },
        lockedAt: new Date(),
        lockedBy: workerId,
        startedAt: job.startedAt ?? new Date(),
        finishedAt: null,
        lastError: null,
      },
    });
  });

export const markZammadSyncJobSucceeded = async (
  jobId: string,
  result: unknown,
) =>
  await prisma.zammadSyncJob.update({
    where: { id: jobId },
    data: {
      status: ZammadSyncJobStatus.SUCCEEDED,
      result: toJsonValue(result),
      lockedAt: null,
      lockedBy: null,
      finishedAt: new Date(),
      lastError: null,
    },
  });

export const markZammadSyncJobFailed = async (
  job: ZammadSyncJob,
  error: unknown,
) => {
  const message = error instanceof Error ? error.message : String(error);
  const willRetry = job.attempts < job.maxAttempts;

  return await prisma.zammadSyncJob.update({
    where: { id: job.id },
    data: {
      status: willRetry
        ? ZammadSyncJobStatus.PENDING
        : ZammadSyncJobStatus.FAILED,
      runAfter: willRetry
        ? new Date(Date.now() + getRetryDelayMs(job.attempts))
        : job.runAfter,
      lockedAt: null,
      lockedBy: null,
      finishedAt: willRetry ? null : new Date(),
      lastError: message,
    },
  });
};

export const recoverStaleZammadSyncJobs = async (staleAfterMs: number) => {
  const cutoff = new Date(Date.now() - staleAfterMs);

  return await prisma.zammadSyncJob.updateMany({
    where: {
      status: ZammadSyncJobStatus.RUNNING,
      lockedAt: { lt: cutoff },
    },
    data: {
      status: ZammadSyncJobStatus.PENDING,
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(),
      lastError: "Recovered stale worker lock.",
    },
  });
};
