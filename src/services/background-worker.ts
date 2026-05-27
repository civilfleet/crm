import os from "node:os";
import { type ZammadSyncJob, ZammadSyncJobType } from "@prisma/client";
import logger from "@/lib/logger";
import prisma from "@/lib/prisma";
import { cleanupExpiredPendingUploads } from "@/services/file/pending-uploads";
import {
  claimNextEmailBatch,
  markEmailBatchFailed,
  processEmailBatch,
  recoverStaleEmailBatches,
} from "@/services/integrations/scaleway-email";
import {
  syncZammadIntegration,
  syncZammadTicket,
} from "@/services/integrations/zammad";
import {
  claimNextZammadSyncJob,
  markZammadSyncJobFailed,
  markZammadSyncJobSucceeded,
  recoverStaleZammadSyncJobs,
} from "@/services/integrations/zammad-queue";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_STALE_LOCK_MS = 60 * 60 * 1000;
const DEFAULT_PENDING_UPLOAD_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_PENDING_UPLOAD_CLEANUP_LIMIT = 100;

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const sleep = async (ms: number) =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const processZammadSyncJob = async (job: ZammadSyncJob) => {
  switch (job.type) {
    case ZammadSyncJobType.INCREMENTAL_SYNC:
      return await syncZammadIntegration(job.teamId, { fullSync: false });
    case ZammadSyncJobType.FULL_SYNC:
      return await syncZammadIntegration(job.teamId, { fullSync: true });
    case ZammadSyncJobType.TICKET_SYNC:
      if (!job.ticketId) {
        throw new Error("Ticket sync job is missing ticketId.");
      }
      return await syncZammadTicket(job.teamId, job.ticketId);
    default:
      throw new Error(`Unsupported Zammad sync job type: ${job.type}`);
  }
};

export const runBackgroundWorker = async () => {
  const pollIntervalMs = parsePositiveInteger(
    process.env.BACKGROUND_WORKER_POLL_INTERVAL_MS ??
      process.env.ZAMMAD_WORKER_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );
  const staleLockMs = parsePositiveInteger(
    process.env.BACKGROUND_WORKER_STALE_LOCK_MS ??
      process.env.ZAMMAD_WORKER_STALE_LOCK_MS,
    DEFAULT_STALE_LOCK_MS,
  );
  const pendingUploadCleanupIntervalMs = parsePositiveInteger(
    process.env.PENDING_UPLOAD_CLEANUP_INTERVAL_MS,
    DEFAULT_PENDING_UPLOAD_CLEANUP_INTERVAL_MS,
  );
  const pendingUploadCleanupLimit = parsePositiveInteger(
    process.env.PENDING_UPLOAD_CLEANUP_LIMIT,
    DEFAULT_PENDING_UPLOAD_CLEANUP_LIMIT,
  );
  const workerId =
    process.env.BACKGROUND_WORKER_ID ??
    process.env.ZAMMAD_WORKER_ID ??
    `${os.hostname()}-${process.pid}`;
  let shouldStop = false;
  let nextPendingUploadCleanupAt = 0;

  const stop = () => {
    shouldStop = true;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const recovered = await recoverStaleZammadSyncJobs(staleLockMs);
  if (recovered.count > 0) {
    logger.warn(
      { workerId, recovered: recovered.count },
      "[BackgroundWorker] Recovered stale Zammad jobs",
    );
  }

  const recoveredEmailBatches = await recoverStaleEmailBatches(staleLockMs);
  if (recoveredEmailBatches.count > 0) {
    logger.warn(
      { workerId, recovered: recoveredEmailBatches.count },
      "[BackgroundWorker] Recovered stale email batches",
    );
  }

  logger.info(
    {
      workerId,
      pollIntervalMs,
      pendingUploadCleanupIntervalMs,
      pendingUploadCleanupLimit,
    },
    "[BackgroundWorker] Started",
  );

  const runPendingUploadCleanup = async () => {
    const now = Date.now();
    if (now < nextPendingUploadCleanupAt) {
      return;
    }

    nextPendingUploadCleanupAt = now + pendingUploadCleanupIntervalMs;

    try {
      const result = await cleanupExpiredPendingUploads({
        limit: pendingUploadCleanupLimit,
      });

      if (result.scanned > 0 || result.failed > 0) {
        logger.info(
          { workerId, result },
          "[BackgroundWorker] Pending upload cleanup finished",
        );
      }
    } catch (error) {
      logger.error(
        { workerId, error },
        "[BackgroundWorker] Pending upload cleanup failed",
      );
    }
  };

  while (!shouldStop) {
    await runPendingUploadCleanup();

    const job = await claimNextZammadSyncJob(workerId);

    if (!job) {
      const emailBatch = await claimNextEmailBatch(workerId);

      if (!emailBatch) {
        await sleep(pollIntervalMs);
        continue;
      }

      logger.info(
        { workerId, batchId: emailBatch.id, teamId: emailBatch.teamId },
        "[BackgroundWorker] Processing email batch",
      );

      try {
        const result = await processEmailBatch(emailBatch);
        logger.info(
          { workerId, batchId: emailBatch.id, result },
          "[BackgroundWorker] Email batch processed",
        );
      } catch (error) {
        const updated = await markEmailBatchFailed(emailBatch, error);
        logger.error(
          {
            workerId,
            batchId: emailBatch.id,
            attempts: updated.attempts,
            status: updated.status,
            error,
          },
          "[BackgroundWorker] Email batch failed",
        );
      }

      continue;
    }

    logger.info(
      { workerId, jobId: job.id, type: job.type, teamId: job.teamId },
      "[BackgroundWorker] Processing Zammad job",
    );

    try {
      const result = await processZammadSyncJob(job);
      await markZammadSyncJobSucceeded(job.id, result);
      logger.info(
        { workerId, jobId: job.id, result },
        "[BackgroundWorker] Zammad job succeeded",
      );
    } catch (error) {
      const updated = await markZammadSyncJobFailed(job, error);
      logger.error(
        {
          workerId,
          jobId: job.id,
          attempts: updated.attempts,
          status: updated.status,
          error,
        },
        "[BackgroundWorker] Zammad job failed",
      );
    }
  }

  await prisma.$disconnect();
  logger.info({ workerId }, "[BackgroundWorker] Stopped");
};
