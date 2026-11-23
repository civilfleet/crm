import {
  type KlaviyoSyncJob,
  KlaviyoSyncJobStatus,
  Prisma,
} from "@prisma/client";
import prisma from "@/lib/prisma";

/*
  Klaviyo syncs run in the background worker, one job per sync. The database
  allows one PENDING or RUNNING job per team (KlaviyoSyncJob_active_team_key),
  so two clicks or the schedule and a click never run two syncs at once.
*/

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_SECONDS = 60;
const MAX_RETRY_DELAY_SECONDS = 30 * 60;

const ACTIVE = [KlaviyoSyncJobStatus.PENDING, KlaviyoSyncJobStatus.RUNNING];

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export const getKlaviyoRetryDelayMs = (attempts: number) =>
  Math.min(
    RETRY_DELAY_SECONDS * 2 ** Math.max(attempts - 1, 0),
    MAX_RETRY_DELAY_SECONDS,
  ) * 1000;

const findActiveJob = (teamId: string) =>
  prisma.klaviyoSyncJob.findFirst({
    where: { teamId, status: { in: ACTIVE } },
  });

/** Queues a sync of the team, or returns the one already queued or running. */
export const enqueueKlaviyoSyncJob = async (teamId: string) => {
  const active = await findActiveJob(teamId);
  if (active) return active;
  try {
    return await prisma.klaviyoSyncJob.create({
      data: { teamId, maxAttempts: MAX_ATTEMPTS },
    });
  } catch (error) {
    // Queued by someone else in the meantime.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const queued = await findActiveJob(teamId);
      if (queued) return queued;
    }
    throw error;
  }
};

/**
 * Queues a sync for every enabled integration whose last sync is older than
 * `intervalMs` and that has none queued. Returns how many were queued.
 */
export const enqueueDueKlaviyoSyncs = async (
  intervalMs: number,
  now = new Date(),
) => {
  const due = await prisma.integrationConnection.findMany({
    where: {
      provider: "KLAVIYO",
      isEnabled: true,
      OR: [
        { lastSyncedAt: null },
        { lastSyncedAt: { lt: new Date(now.getTime() - intervalMs) } },
      ],
      team: {
        klaviyoSyncJobs: {
          none: {
            OR: [
              { status: { in: ACTIVE } },
              // A failed sync waits for its own retry interval, not this one.
              {
                status: KlaviyoSyncJobStatus.FAILED,
                finishedAt: { gt: new Date(now.getTime() - intervalMs) },
              },
            ],
          },
        },
      },
    },
    select: { teamId: true },
  });
  for (const { teamId } of due) {
    await enqueueKlaviyoSyncJob(teamId);
  }
  return due.length;
};

export const claimNextKlaviyoSyncJob = async (workerId: string) =>
  await prisma.$transaction(async (tx) => {
    const jobs = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "KlaviyoSyncJob"
      WHERE "status" = 'PENDING'::"KlaviyoSyncJobStatus"
        AND "runAfter" <= now()
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const job = jobs[0];
    if (!job) return null;
    const now = new Date();
    return await tx.klaviyoSyncJob.update({
      where: { id: job.id },
      data: {
        status: KlaviyoSyncJobStatus.RUNNING,
        attempts: { increment: 1 },
        lockedAt: now,
        lockedBy: workerId,
        startedAt: now,
        finishedAt: null,
        lastError: null,
      },
    });
  });

export const markKlaviyoSyncJobSucceeded = async (
  jobId: string,
  result: unknown,
) =>
  await prisma.klaviyoSyncJob.update({
    where: { id: jobId },
    data: {
      status: KlaviyoSyncJobStatus.SUCCEEDED,
      result: toJsonValue(result),
      lockedAt: null,
      lockedBy: null,
      finishedAt: new Date(),
      lastError: null,
    },
  });

export const markKlaviyoSyncJobFailed = async (
  job: KlaviyoSyncJob,
  error: unknown,
) => {
  const message = error instanceof Error ? error.message : String(error);
  const willRetry = job.attempts < job.maxAttempts;
  return await prisma.klaviyoSyncJob.update({
    where: { id: job.id },
    data: {
      status: willRetry
        ? KlaviyoSyncJobStatus.PENDING
        : KlaviyoSyncJobStatus.FAILED,
      runAfter: willRetry
        ? new Date(Date.now() + getKlaviyoRetryDelayMs(job.attempts))
        : job.runAfter,
      lockedAt: null,
      lockedBy: null,
      finishedAt: willRetry ? null : new Date(),
      lastError: message,
    },
  });
};

/** Jobs left RUNNING by a worker that died go back to the queue. */
export const recoverStaleKlaviyoSyncJobs = async (staleAfterMs: number) =>
  await prisma.klaviyoSyncJob.updateMany({
    where: {
      status: KlaviyoSyncJobStatus.RUNNING,
      lockedAt: { lt: new Date(Date.now() - staleAfterMs) },
    },
    data: {
      status: KlaviyoSyncJobStatus.PENDING,
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(),
      lastError: "Recovered stale worker lock.",
    },
  });

export const getLatestKlaviyoSyncJob = (teamId: string) =>
  prisma.klaviyoSyncJob.findFirst({
    where: { teamId },
    orderBy: { createdAt: "desc" },
  });
