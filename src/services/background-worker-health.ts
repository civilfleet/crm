import prisma from "@/lib/prisma";

export type BackgroundWorkerHealthSnapshot = {
  workerId: string;
  startedAt: Date;
  lastSeenAt: Date;
  emailQueueDepth: number;
  oldestEmailQueuedAt: Date | null;
  zammadQueueDepth: number;
  oldestZammadQueuedAt: Date | null;
  enabledInboxCount: number;
  oldestInboxSyncedAt: Date | null;
  enabledKlaviyoCount: number;
  oldestKlaviyoSyncedAt: Date | null;
};

type BackgroundWorkerHealthLimits = {
  now: Date;
  maxHeartbeatAgeMs: number;
  maxEmailQueueLagMs: number;
  maxZammadQueueLagMs: number;
  maxInboxSyncLagMs: number;
  maxKlaviyoSyncLagMs: number;
};

export type BackgroundWorkerHealthResult = {
  healthy: boolean;
  reason:
    | "healthy"
    | "missing_heartbeat"
    | "stale_heartbeat"
    | "email_queue_lag"
    | "zammad_queue_lag"
    | "inbox_sync_lag"
    | "klaviyo_sync_lag";
  heartbeatAgeMs: number | null;
  emailQueueLagMs: number | null;
  zammadQueueLagMs: number | null;
  inboxSyncLagMs: number | null;
  klaviyoSyncLagMs: number | null;
};

export const evaluateBackgroundWorkerHealth = (
  snapshot: BackgroundWorkerHealthSnapshot | null,
  limits: BackgroundWorkerHealthLimits,
): BackgroundWorkerHealthResult => {
  if (!snapshot) {
    return {
      healthy: false,
      reason: "missing_heartbeat",
      heartbeatAgeMs: null,
      emailQueueLagMs: null,
      zammadQueueLagMs: null,
      inboxSyncLagMs: null,
      klaviyoSyncLagMs: null,
    };
  }

  const ageOf = (date: Date | null) =>
    date ? Math.max(0, limits.now.getTime() - date.getTime()) : null;
  const heartbeatAgeMs = ageOf(snapshot.lastSeenAt) ?? 0;
  const lags = {
    heartbeatAgeMs,
    emailQueueLagMs: ageOf(snapshot.oldestEmailQueuedAt),
    zammadQueueLagMs: ageOf(snapshot.oldestZammadQueuedAt),
    inboxSyncLagMs: ageOf(snapshot.oldestInboxSyncedAt),
    klaviyoSyncLagMs: ageOf(snapshot.oldestKlaviyoSyncedAt),
  };
  const unhealthy = (reason: BackgroundWorkerHealthResult["reason"]) => ({
    healthy: false,
    reason,
    ...lags,
  });

  if (heartbeatAgeMs > limits.maxHeartbeatAgeMs) {
    return unhealthy("stale_heartbeat");
  }
  if (
    snapshot.emailQueueDepth > 0 &&
    lags.emailQueueLagMs !== null &&
    lags.emailQueueLagMs > limits.maxEmailQueueLagMs
  ) {
    return unhealthy("email_queue_lag");
  }
  if (
    snapshot.zammadQueueDepth > 0 &&
    lags.zammadQueueLagMs !== null &&
    lags.zammadQueueLagMs > limits.maxZammadQueueLagMs
  ) {
    return unhealthy("zammad_queue_lag");
  }
  if (
    snapshot.enabledInboxCount > 0 &&
    (lags.inboxSyncLagMs === null ||
      lags.inboxSyncLagMs > limits.maxInboxSyncLagMs)
  ) {
    return unhealthy("inbox_sync_lag");
  }
  if (
    snapshot.enabledKlaviyoCount > 0 &&
    (lags.klaviyoSyncLagMs === null ||
      lags.klaviyoSyncLagMs > limits.maxKlaviyoSyncLagMs)
  ) {
    return unhealthy("klaviyo_sync_lag");
  }

  return { healthy: true, reason: "healthy", ...lags };
};

export const recordBackgroundWorkerHeartbeat = async (
  workerId: string,
  startedAt: Date,
  now = new Date(),
) => {
  const [
    emailQueueDepth,
    oldestEmailBatch,
    zammadQueueDepth,
    oldestZammadJob,
    inboxes,
    klaviyoIntegrations,
  ] = await prisma.$transaction([
    prisma.emailBatch.count({
      where: {
        status: "SENDING",
        lockedAt: null,
        runAfter: { lte: now },
      },
    }),
    prisma.emailBatch.findFirst({
      where: {
        status: "SENDING",
        lockedAt: null,
        runAfter: { lte: now },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.zammadSyncJob.count({
      where: { status: "PENDING", runAfter: { lte: now } },
    }),
    prisma.zammadSyncJob.findFirst({
      where: { status: "PENDING", runAfter: { lte: now } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.emailInbox.findMany({
      where: { isEnabled: true },
      select: { lastSyncedAt: true, createdAt: true },
    }),
    prisma.integrationConnection.findMany({
      where: { provider: "KLAVIYO", isEnabled: true },
      select: { lastSyncedAt: true, createdAt: true },
    }),
  ]);
  const oldestSyncedAt = (
    rows: Array<{ lastSyncedAt: Date | null; createdAt: Date }>,
  ) =>
    rows.reduce<Date | null>((oldest, row) => {
      const value = row.lastSyncedAt ?? row.createdAt;
      return !oldest || value < oldest ? value : oldest;
    }, null);
  const oldestInboxSyncedAt = oldestSyncedAt(inboxes);
  const oldestKlaviyoSyncedAt = oldestSyncedAt(klaviyoIntegrations);

  return await prisma.backgroundWorkerHeartbeat.upsert({
    where: { workerId },
    create: {
      workerId,
      startedAt,
      lastSeenAt: now,
      emailQueueDepth,
      oldestEmailQueuedAt: oldestEmailBatch?.createdAt,
      zammadQueueDepth,
      oldestZammadQueuedAt: oldestZammadJob?.createdAt,
      enabledInboxCount: inboxes.length,
      oldestInboxSyncedAt,
      enabledKlaviyoCount: klaviyoIntegrations.length,
      oldestKlaviyoSyncedAt,
    },
    update: {
      startedAt,
      lastSeenAt: now,
      emailQueueDepth,
      oldestEmailQueuedAt: oldestEmailBatch?.createdAt ?? null,
      zammadQueueDepth,
      oldestZammadQueuedAt: oldestZammadJob?.createdAt ?? null,
      enabledInboxCount: inboxes.length,
      oldestInboxSyncedAt,
      enabledKlaviyoCount: klaviyoIntegrations.length,
      oldestKlaviyoSyncedAt,
    },
  });
};

export const getLatestBackgroundWorkerHeartbeat = async (workerId?: string) =>
  await prisma.backgroundWorkerHeartbeat.findFirst({
    ...(workerId ? { where: { workerId } } : {}),
    orderBy: { lastSeenAt: "desc" },
  });
