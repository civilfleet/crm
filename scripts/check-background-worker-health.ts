import "dotenv/config";
import prisma from "@/lib/prisma";
import {
  evaluateBackgroundWorkerHealth,
  getLatestBackgroundWorkerHeartbeat,
} from "@/services/background-worker-health";

const DEFAULT_MAX_HEARTBEAT_AGE_MS = 2 * 60 * 1000;
const DEFAULT_MAX_EMAIL_QUEUE_LAG_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ZAMMAD_QUEUE_LAG_MS = 5 * 60 * 1000;
const DEFAULT_MAX_INBOX_SYNC_LAG_MS = 5 * 60 * 1000;
// Klaviyo syncs every 15 minutes by default and a large account takes a
// while; two hours without a finished sync means it is stuck or failing.
const DEFAULT_MAX_KLAVIYO_SYNC_LAG_MS = 2 * 60 * 60 * 1000;

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
  const snapshot = await getLatestBackgroundWorkerHeartbeat(
    process.env.BACKGROUND_WORKER_ID,
  );
  const maxZammadQueueLagMs = parsePositiveInteger(
    process.env.BACKGROUND_WORKER_ZAMMAD_QUEUE_MAX_LAG_MS,
    DEFAULT_MAX_ZAMMAD_QUEUE_LAG_MS,
  );
  const maxInboxSyncLagMs = parsePositiveInteger(
    process.env.BACKGROUND_WORKER_INBOX_SYNC_MAX_LAG_MS,
    DEFAULT_MAX_INBOX_SYNC_LAG_MS,
  );
  const maxKlaviyoSyncLagMs = parsePositiveInteger(
    process.env.BACKGROUND_WORKER_KLAVIYO_SYNC_MAX_LAG_MS,
    DEFAULT_MAX_KLAVIYO_SYNC_LAG_MS,
  );
  const result = evaluateBackgroundWorkerHealth(snapshot, {
    now: new Date(),
    maxHeartbeatAgeMs,
    maxEmailQueueLagMs,
    maxZammadQueueLagMs,
    maxInboxSyncLagMs,
    maxKlaviyoSyncLagMs,
  });

  console.log(
    JSON.stringify({
      ...result,
      workerId: snapshot?.workerId ?? null,
      lastSeenAt: snapshot?.lastSeenAt.toISOString() ?? null,
      emailQueueDepth: snapshot?.emailQueueDepth ?? null,
      oldestEmailQueuedAt: snapshot?.oldestEmailQueuedAt?.toISOString() ?? null,
      zammadQueueDepth: snapshot?.zammadQueueDepth ?? null,
      oldestZammadQueuedAt:
        snapshot?.oldestZammadQueuedAt?.toISOString() ?? null,
      enabledInboxCount: snapshot?.enabledInboxCount ?? null,
      oldestInboxSyncedAt: snapshot?.oldestInboxSyncedAt?.toISOString() ?? null,
      enabledKlaviyoCount: snapshot?.enabledKlaviyoCount ?? null,
      oldestKlaviyoSyncedAt:
        snapshot?.oldestKlaviyoSyncedAt?.toISOString() ?? null,
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
