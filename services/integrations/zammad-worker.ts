import os from "os";
import { ZammadSyncJobType, type ZammadSyncJob } from "@prisma/client";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import {
  claimNextZammadSyncJob,
  markZammadSyncJobFailed,
  markZammadSyncJobSucceeded,
  recoverStaleZammadSyncJobs,
} from "@/services/integrations/zammad-queue";
import {
  syncZammadIntegration,
  syncZammadTicket,
} from "@/services/integrations/zammad";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_STALE_LOCK_MS = 60 * 60 * 1000;

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

export const runZammadWorker = async () => {
  const pollIntervalMs = parsePositiveInteger(
    process.env.ZAMMAD_WORKER_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );
  const staleLockMs = parsePositiveInteger(
    process.env.ZAMMAD_WORKER_STALE_LOCK_MS,
    DEFAULT_STALE_LOCK_MS,
  );
  const workerId =
    process.env.ZAMMAD_WORKER_ID ?? `${os.hostname()}-${process.pid}`;
  let shouldStop = false;

  const stop = () => {
    shouldStop = true;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const recovered = await recoverStaleZammadSyncJobs(staleLockMs);
  if (recovered.count > 0) {
    logger.warn(
      { workerId, recovered: recovered.count },
      "[ZammadWorker] Recovered stale jobs",
    );
  }

  logger.info({ workerId, pollIntervalMs }, "[ZammadWorker] Started");

  while (!shouldStop) {
    const job = await claimNextZammadSyncJob(workerId);

    if (!job) {
      await sleep(pollIntervalMs);
      continue;
    }

    logger.info(
      { workerId, jobId: job.id, type: job.type, teamId: job.teamId },
      "[ZammadWorker] Processing job",
    );

    try {
      const result = await processZammadSyncJob(job);
      await markZammadSyncJobSucceeded(job.id, result);
      logger.info(
        { workerId, jobId: job.id, result },
        "[ZammadWorker] Job succeeded",
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
        "[ZammadWorker] Job failed",
      );
    }
  }

  await prisma.$disconnect();
  logger.info({ workerId }, "[ZammadWorker] Stopped");
};
