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
};

type BackgroundWorkerHealthLimits = {
  now: Date;
  maxHeartbeatAgeMs: number;
  maxEmailQueueLagMs: number;
  maxZammadQueueLagMs: number;
  maxInboxSyncLagMs: number;
};

export type BackgroundWorkerHealthResult = {
  healthy: boolean;
  reason:
    | "healthy"
    | "missing_heartbeat"
    | "stale_heartbeat"
    | "email_queue_lag"
    | "zammad_queue_lag"
    | "inbox_sync_lag";
  heartbeatAgeMs: number | null;
  emailQueueLagMs: number | null;
  zammadQueueLagMs: number | null;
  inboxSyncLagMs: number | null;
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
    };
  }

  const heartbeatAgeMs = Math.max(
    0,
    limits.now.getTime() - snapshot.lastSeenAt.getTime(),
  );
  const emailQueueLagMs = snapshot.oldestEmailQueuedAt
    ? Math.max(0, limits.now.getTime() - snapshot.oldestEmailQueuedAt.getTime())
    : null;
  const zammadQueueLagMs = snapshot.oldestZammadQueuedAt
    ? Math.max(
        0,
        limits.now.getTime() - snapshot.oldestZammadQueuedAt.getTime(),
      )
    : null;
  const inboxSyncLagMs = snapshot.oldestInboxSyncedAt
    ? Math.max(0, limits.now.getTime() - snapshot.oldestInboxSyncedAt.getTime())
    : null;

  if (heartbeatAgeMs > limits.maxHeartbeatAgeMs) {
    return {
      healthy: false,
      reason: "stale_heartbeat",
      heartbeatAgeMs,
      emailQueueLagMs,
      zammadQueueLagMs,
      inboxSyncLagMs,
    };
  }

  if (
    snapshot.emailQueueDepth > 0 &&
    emailQueueLagMs !== null &&
    emailQueueLagMs > limits.maxEmailQueueLagMs
  ) {
    return {
      healthy: false,
      reason: "email_queue_lag",
      heartbeatAgeMs,
      emailQueueLagMs,
      zammadQueueLagMs,
      inboxSyncLagMs,
    };
  }

  if (
    snapshot.zammadQueueDepth > 0 &&
    zammadQueueLagMs !== null &&
    zammadQueueLagMs > limits.maxZammadQueueLagMs
  ) {
    return {
      healthy: false,
      reason: "zammad_queue_lag",
      heartbeatAgeMs,
      emailQueueLagMs,
      zammadQueueLagMs,
      inboxSyncLagMs,
    };
  }

  if (
    snapshot.enabledInboxCount > 0 &&
    (inboxSyncLagMs === null || inboxSyncLagMs > limits.maxInboxSyncLagMs)
  ) {
    return {
      healthy: false,
      reason: "inbox_sync_lag",
      heartbeatAgeMs,
      emailQueueLagMs,
      zammadQueueLagMs,
      inboxSyncLagMs,
    };
  }

  return {
    healthy: true,
    reason: "healthy",
    heartbeatAgeMs,
    emailQueueLagMs,
    zammadQueueLagMs,
    inboxSyncLagMs,
  };
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
  ]);
  const oldestInboxSyncedAt = inboxes.reduce<Date | null>((oldest, inbox) => {
    const value = inbox.lastSyncedAt ?? inbox.createdAt;
    return !oldest || value < oldest ? value : oldest;
  }, null);

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
    },
  });
};

export const getLatestBackgroundWorkerHeartbeat = async () =>
  await prisma.backgroundWorkerHeartbeat.findFirst({
    orderBy: { lastSeenAt: "desc" },
  });
