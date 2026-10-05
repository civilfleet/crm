CREATE TABLE "BackgroundWorkerHeartbeat" (
    "workerId" VARCHAR(255) NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL,
    "emailQueueDepth" INTEGER NOT NULL DEFAULT 0,
    "oldestEmailQueuedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BackgroundWorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

CREATE INDEX "BackgroundWorkerHeartbeat_lastSeenAt_idx"
ON "BackgroundWorkerHeartbeat"("lastSeenAt");
