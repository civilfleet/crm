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
import { syncDueEmailInboxes } from "@/services/inbound-email";
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
import { recordSystemLog } from "@/services/system-logs";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_STALE_LOCK_MS = 60 * 60 * 1000;
const DEFAULT_PENDING_UPLOAD_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_PENDING_UPLOAD_CLEANUP_LIMIT = 100;
const DEFAULT_INBOUND_EMAIL_SYNC_INTERVAL_MS = 60 * 1000;
const DEFAULT_INBOUND_EMAIL_SYNC_LIMIT = 25;

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const sleep = async (ms: number) =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const logWorkerEvent = async (
  input: Omit<Parameters<typeof recordSystemLog>[0], "source"> & {
    source?: string;
  },
) => {
  await recordSystemLog({
    source: "BACKGROUND_WORKER",
    ...input,
  });
};

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
  const inboundEmailSyncIntervalMs = parsePositiveInteger(
    process.env.INBOUND_EMAIL_SYNC_INTERVAL_MS,
    DEFAULT_INBOUND_EMAIL_SYNC_INTERVAL_MS,
  );
  const inboundEmailSyncLimit = parsePositiveInteger(
    process.env.INBOUND_EMAIL_SYNC_LIMIT,
    DEFAULT_INBOUND_EMAIL_SYNC_LIMIT,
  );
  const workerId =
    process.env.BACKGROUND_WORKER_ID ??
    process.env.ZAMMAD_WORKER_ID ??
    `${os.hostname()}-${process.pid}`;
  let shouldStop = false;
  let nextPendingUploadCleanupAt = 0;
  let nextInboundEmailSyncAt = 0;

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
    await logWorkerEvent({
      level: "WARN",
      event: "zammad_jobs_recovered",
      message: `Recovered ${recovered.count} stale Zammad sync jobs.`,
      workerId,
      source: "ZAMMAD",
      metadata: { recovered: recovered.count },
    });
  }

  const recoveredEmailBatches = await recoverStaleEmailBatches(staleLockMs);
  if (recoveredEmailBatches.count > 0) {
    logger.warn(
      { workerId, recovered: recoveredEmailBatches.count },
      "[BackgroundWorker] Recovered stale email batches",
    );
    await logWorkerEvent({
      level: "WARN",
      event: "email_batches_recovered",
      message: `Recovered ${recoveredEmailBatches.count} stale email batches.`,
      workerId,
      source: "EMAIL_BATCH",
      metadata: { recovered: recoveredEmailBatches.count },
    });
  }

  logger.info(
    {
      workerId,
      pollIntervalMs,
      pendingUploadCleanupIntervalMs,
      pendingUploadCleanupLimit,
      inboundEmailSyncIntervalMs,
      inboundEmailSyncLimit,
    },
    "[BackgroundWorker] Started",
  );
  await logWorkerEvent({
    event: "worker_started",
    message: "Background worker started.",
    workerId,
    metadata: {
      pollIntervalMs,
      pendingUploadCleanupIntervalMs,
      pendingUploadCleanupLimit,
      inboundEmailSyncIntervalMs,
      inboundEmailSyncLimit,
    },
  });

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
        await logWorkerEvent({
          level: result.failed > 0 ? "WARN" : "INFO",
          event: "pending_upload_cleanup_finished",
          message: `Pending upload cleanup scanned ${result.scanned} uploads and failed ${result.failed}.`,
          workerId,
          source: "PENDING_UPLOAD",
          metadata: result,
        });
      }
    } catch (error) {
      logger.error(
        { workerId, error },
        "[BackgroundWorker] Pending upload cleanup failed",
      );
      await logWorkerEvent({
        level: "ERROR",
        event: "pending_upload_cleanup_failed",
        message: "Pending upload cleanup failed.",
        workerId,
        source: "PENDING_UPLOAD",
        metadata: { error },
      });
    }
  };

  const runInboundEmailSync = async () => {
    const now = Date.now();
    if (now < nextInboundEmailSyncAt) {
      return;
    }

    nextInboundEmailSyncAt = now + inboundEmailSyncIntervalMs;

    try {
      const results = await syncDueEmailInboxes(workerId, {
        limit: inboundEmailSyncLimit,
        staleLockMs,
      });
      const imported = results.reduce((count, result) => {
        if ("imported" in result && typeof result.imported === "number") {
          return count + result.imported;
        }
        return count;
      }, 0);

      if (results.length > 0 || imported > 0) {
        logger.info(
          { workerId, inboxes: results.length, imported, results },
          "[BackgroundWorker] Inbound email sync finished",
        );
        for (const result of results) {
          await logWorkerEvent({
            teamId: result.teamId,
            level: "error" in result ? "ERROR" : "INFO",
            event: "inbound_email_sync_finished",
            message:
              "error" in result
                ? `Inbound email sync failed for inbox ${result.inboxId}.`
                : `Inbound email sync fetched ${
                    result.stats?.fetched ?? result.imported
                  } messages and imported ${result.imported} from inbox ${
                    result.inboxId
                  }.`,
            workerId,
            source: "INBOUND_EMAIL",
            entityType: "EmailInbox",
            entityId: result.inboxId,
            metadata: result,
          });
        }
      }
    } catch (error) {
      logger.error(
        { workerId, error },
        "[BackgroundWorker] Inbound email sync failed",
      );
      await logWorkerEvent({
        level: "ERROR",
        event: "inbound_email_sync_failed",
        message: "Inbound email sync loop failed.",
        workerId,
        source: "INBOUND_EMAIL",
        metadata: { error },
      });
    }
  };

  while (!shouldStop) {
    await runPendingUploadCleanup();
    await runInboundEmailSync();

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
      await logWorkerEvent({
        teamId: emailBatch.teamId,
        event: "email_batch_processing",
        message: `Processing email batch ${emailBatch.id}.`,
        workerId,
        source: "EMAIL_BATCH",
        entityType: "EmailBatch",
        entityId: emailBatch.id,
        metadata: {
          subject: emailBatch.subject,
          requestedCount: emailBatch.requestedCount,
          attempts: emailBatch.attempts,
        },
      });

      try {
        const result = await processEmailBatch(emailBatch);
        logger.info(
          { workerId, batchId: emailBatch.id, result },
          "[BackgroundWorker] Email batch processed",
        );
        await logWorkerEvent({
          teamId: emailBatch.teamId,
          event: "email_batch_processed",
          message: `Email batch ${emailBatch.id} processed.`,
          workerId,
          source: "EMAIL_BATCH",
          entityType: "EmailBatch",
          entityId: emailBatch.id,
          metadata: result,
        });
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
        await logWorkerEvent({
          teamId: emailBatch.teamId,
          level: "ERROR",
          event: "email_batch_failed",
          message: `Email batch ${emailBatch.id} failed.`,
          workerId,
          source: "EMAIL_BATCH",
          entityType: "EmailBatch",
          entityId: emailBatch.id,
          metadata: {
            attempts: updated.attempts,
            status: updated.status,
            error,
          },
        });
      }

      continue;
    }

    logger.info(
      { workerId, jobId: job.id, type: job.type, teamId: job.teamId },
      "[BackgroundWorker] Processing Zammad job",
    );
    await logWorkerEvent({
      teamId: job.teamId,
      event: "zammad_job_processing",
      message: `Processing Zammad ${job.type} job ${job.id}.`,
      workerId,
      source: "ZAMMAD",
      entityType: "ZammadSyncJob",
      entityId: job.id,
      metadata: {
        type: job.type,
        ticketId: job.ticketId,
        attempts: job.attempts,
      },
    });

    try {
      const result = await processZammadSyncJob(job);
      await markZammadSyncJobSucceeded(job.id, result);
      logger.info(
        { workerId, jobId: job.id, result },
        "[BackgroundWorker] Zammad job succeeded",
      );
      await logWorkerEvent({
        teamId: job.teamId,
        event: "zammad_job_succeeded",
        message: `Zammad ${job.type} job ${job.id} succeeded.`,
        workerId,
        source: "ZAMMAD",
        entityType: "ZammadSyncJob",
        entityId: job.id,
        metadata: result,
      });
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
      await logWorkerEvent({
        teamId: job.teamId,
        level: "ERROR",
        event: "zammad_job_failed",
        message: `Zammad ${job.type} job ${job.id} failed.`,
        workerId,
        source: "ZAMMAD",
        entityType: "ZammadSyncJob",
        entityId: job.id,
        metadata: {
          attempts: updated.attempts,
          status: updated.status,
          error,
        },
      });
    }
  }

  await logWorkerEvent({
    event: "worker_stopped",
    message: "Background worker stopped.",
    workerId,
  });
  await prisma.$disconnect();
  logger.info({ workerId }, "[BackgroundWorker] Stopped");
};
