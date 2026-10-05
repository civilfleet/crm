import prisma from "@/lib/prisma";

export type BackgroundWorkerHealthSnapshot = {
  workerId: string;
  startedAt: Date;
  lastSeenAt: Date;
  emailQueueDepth: number;
  oldestEmailQueuedAt: Date | null;
};

type BackgroundWorkerHealthLimits = {
  now: Date;
  maxHeartbeatAgeMs: number;
  maxEmailQueueLagMs: number;
};

export type BackgroundWorkerHealthResult = {
  healthy: boolean;
  reason:
    | "healthy"
    | "missing_heartbeat"
    | "stale_heartbeat"
    | "email_queue_lag";
  heartbeatAgeMs: number | null;
  emailQueueLagMs: number | null;
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
    };
  }

  const heartbeatAgeMs = Math.max(
    0,
    limits.now.getTime() - snapshot.lastSeenAt.getTime(),
  );
  const emailQueueLagMs = snapshot.oldestEmailQueuedAt
    ? Math.max(0, limits.now.getTime() - snapshot.oldestEmailQueuedAt.getTime())
    : null;

  if (heartbeatAgeMs > limits.maxHeartbeatAgeMs) {
    return {
      healthy: false,
      reason: "stale_heartbeat",
      heartbeatAgeMs,
      emailQueueLagMs,
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
    };
  }

  return {
    healthy: true,
    reason: "healthy",
    heartbeatAgeMs,
    emailQueueLagMs,
  };
};

export const recordBackgroundWorkerHeartbeat = async (
  workerId: string,
  startedAt: Date,
  now = new Date(),
) => {
  const [emailQueueDepth, oldestEmailBatch] = await prisma.$transaction([
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
  ]);

  return await prisma.backgroundWorkerHeartbeat.upsert({
    where: { workerId },
    create: {
      workerId,
      startedAt,
      lastSeenAt: now,
      emailQueueDepth,
      oldestEmailQueuedAt: oldestEmailBatch?.createdAt,
    },
    update: {
      startedAt,
      lastSeenAt: now,
      emailQueueDepth,
      oldestEmailQueuedAt: oldestEmailBatch?.createdAt ?? null,
    },
  });
};

export const getLatestBackgroundWorkerHeartbeat = async () =>
  await prisma.backgroundWorkerHeartbeat.findFirst({
    orderBy: { lastSeenAt: "desc" },
  });
