import "dotenv/config";
import prisma from "@/lib/prisma";
import {
  evaluateBackgroundWorkerHealth,
  getLatestBackgroundWorkerHeartbeat,
} from "@/services/background-worker-health";

const DEFAULT_MAX_HEARTBEAT_AGE_MS = 2 * 60 * 1000;
const DEFAULT_MAX_EMAIL_QUEUE_LAG_MS = 5 * 60 * 1000;

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const main = async () => {
  const maxHeartbeatAgeMs = parsePositiveInteger(
    process.env.BACKGROUND_WORKER_HEALTH_MAX_AGE_MS,
    DEFAULT_MAX_HEARTBEAT_AGE_MS,
  );
  const maxEmailQueueLagMs = parsePositiveInteger(
    process.env.BACKGROUND_WORKER_EMAIL_QUEUE_MAX_LAG_MS,
    DEFAULT_MAX_EMAIL_QUEUE_LAG_MS,
  );
  const snapshot = await getLatestBackgroundWorkerHeartbeat();
  const result = evaluateBackgroundWorkerHealth(snapshot, {
    now: new Date(),
    maxHeartbeatAgeMs,
    maxEmailQueueLagMs,
  });

  console.log(
    JSON.stringify({
      ...result,
      workerId: snapshot?.workerId ?? null,
      lastSeenAt: snapshot?.lastSeenAt.toISOString() ?? null,
      emailQueueDepth: snapshot?.emailQueueDepth ?? null,
      oldestEmailQueuedAt: snapshot?.oldestEmailQueuedAt?.toISOString() ?? null,
    }),
  );

  if (!result.healthy) {
    process.exitCode = 1;
  }
};

main()
  .catch((error) => {
    console.error("Background worker health check failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
