import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBackgroundWorkerHealth } from "@/services/background-worker-health";
import { loadModule } from "./helpers/load-module";

test("a pod health probe cannot use another worker's heartbeat", async () => {
  let query: unknown;
  const module = loadModule<{
    getLatestBackgroundWorkerHeartbeat: (workerId?: string) => Promise<unknown>;
  }>("src/services/background-worker-health.ts", {
    "@/lib/prisma": {
      backgroundWorkerHeartbeat: {
        findFirst: async (input: unknown) => {
          query = input;
          return null;
        },
      },
    },
  });
  await module.getLatestBackgroundWorkerHeartbeat("target-pod");
  assert.deepEqual(query, {
    where: { workerId: "target-pod" },
    orderBy: { lastSeenAt: "desc" },
  });
  await module.getLatestBackgroundWorkerHeartbeat();
  assert.deepEqual(query, { orderBy: { lastSeenAt: "desc" } });
});

const now = new Date("2026-10-05T12:00:00.000Z");
const limits = {
  now,
  maxHeartbeatAgeMs: 120_000,
  maxEmailQueueLagMs: 300_000,
  maxZammadQueueLagMs: 300_000,
  maxInboxSyncLagMs: 300_000,
  maxKlaviyoSyncLagMs: 7_200_000,
};

const snapshot = (overrides = {}) => ({
  workerId: "worker-1",
  startedAt: new Date("2026-10-05T11:00:00.000Z"),
  lastSeenAt: new Date("2026-10-05T11:59:30.000Z"),
  emailQueueDepth: 0,
  oldestEmailQueuedAt: null,
  zammadQueueDepth: 0,
  oldestZammadQueuedAt: null,
  enabledInboxCount: 0,
  oldestInboxSyncedAt: null,
  enabledKlaviyoCount: 0,
  oldestKlaviyoSyncedAt: null,
  ...overrides,
});

test("rejects a missing or stale worker heartbeat", () => {
  assert.equal(
    evaluateBackgroundWorkerHealth(null, limits).reason,
    "missing_heartbeat",
  );
  assert.deepEqual(
    evaluateBackgroundWorkerHealth(
      snapshot({ lastSeenAt: new Date("2026-10-05T11:57:59.000Z") }),
      limits,
    ),
    {
      healthy: false,
      reason: "stale_heartbeat",
      heartbeatAgeMs: 121_000,
      emailQueueLagMs: null,
      zammadQueueLagMs: null,
      inboxSyncLagMs: null,
      klaviyoSyncLagMs: null,
    },
  );
});

test("rejects excessive eligible email queue lag", () => {
  assert.deepEqual(
    evaluateBackgroundWorkerHealth(
      snapshot({
        emailQueueDepth: 2,
        oldestEmailQueuedAt: new Date("2026-10-05T11:54:59.000Z"),
      }),
      limits,
    ),
    {
      healthy: false,
      reason: "email_queue_lag",
      heartbeatAgeMs: 30_000,
      emailQueueLagMs: 301_000,
      zammadQueueLagMs: null,
      inboxSyncLagMs: null,
      klaviyoSyncLagMs: null,
    },
  );
});

test("accepts a current heartbeat with no excessive queue lag", () => {
  assert.deepEqual(
    evaluateBackgroundWorkerHealth(
      snapshot({
        emailQueueDepth: 1,
        oldestEmailQueuedAt: new Date("2026-10-05T11:56:00.000Z"),
      }),
      limits,
    ),
    {
      healthy: true,
      reason: "healthy",
      heartbeatAgeMs: 30_000,
      emailQueueLagMs: 240_000,
      zammadQueueLagMs: null,
      inboxSyncLagMs: null,
      klaviyoSyncLagMs: null,
    },
  );
});

test("rejects excessive Zammad queue and inbox sync lag", () => {
  assert.equal(
    evaluateBackgroundWorkerHealth(
      snapshot({
        zammadQueueDepth: 1,
        oldestZammadQueuedAt: new Date("2026-10-05T11:54:59.000Z"),
      }),
      limits,
    ).reason,
    "zammad_queue_lag",
  );
  assert.equal(
    evaluateBackgroundWorkerHealth(
      snapshot({
        enabledInboxCount: 1,
        oldestInboxSyncedAt: new Date("2026-10-05T11:54:59.000Z"),
      }),
      limits,
    ).reason,
    "inbox_sync_lag",
  );
  assert.equal(
    evaluateBackgroundWorkerHealth(
      snapshot({ enabledInboxCount: 1, oldestInboxSyncedAt: null }),
      limits,
    ).reason,
    "inbox_sync_lag",
  );
});

test("rejects a Klaviyo sync that has not finished for too long", () => {
  assert.equal(
    evaluateBackgroundWorkerHealth(
      snapshot({
        enabledKlaviyoCount: 1,
        oldestKlaviyoSyncedAt: new Date("2026-10-05T09:59:59.000Z"),
      }),
      limits,
    ).reason,
    "klaviyo_sync_lag",
  );
  assert.equal(
    evaluateBackgroundWorkerHealth(
      snapshot({
        enabledKlaviyoCount: 1,
        oldestKlaviyoSyncedAt: new Date("2026-10-05T10:30:00.000Z"),
      }),
      limits,
    ).reason,
    "healthy",
  );
  assert.equal(
    evaluateBackgroundWorkerHealth(
      snapshot({ enabledKlaviyoCount: 0, oldestKlaviyoSyncedAt: null }),
      limits,
    ).reason,
    "healthy",
  );
});
