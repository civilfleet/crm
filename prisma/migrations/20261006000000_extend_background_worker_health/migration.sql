ALTER TABLE "BackgroundWorkerHeartbeat"
ADD COLUMN "zammadQueueDepth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "oldestZammadQueuedAt" TIMESTAMPTZ(6),
ADD COLUMN "enabledInboxCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "oldestInboxSyncedAt" TIMESTAMPTZ(6);
