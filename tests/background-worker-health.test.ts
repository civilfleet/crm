import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBackgroundWorkerHealth } from "@/services/background-worker-health";

const now = new Date("2026-10-05T12:00:00.000Z");
const limits = {
  now,
  maxHeartbeatAgeMs: 120_000,
  maxEmailQueueLagMs: 300_000,
  maxZammadQueueLagMs: 300_000,
  maxInboxSyncLagMs: 300_000,
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
