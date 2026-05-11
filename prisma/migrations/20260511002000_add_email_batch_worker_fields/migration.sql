ALTER TABLE "EmailBatch"
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "runAfter" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lockedAt" TIMESTAMPTZ(6),
ADD COLUMN "lockedBy" VARCHAR(255),
ADD COLUMN "startedAt" TIMESTAMPTZ(6),
ADD COLUMN "lastError" TEXT;

DROP INDEX IF EXISTS "EmailBatch_status_idx";

CREATE INDEX "EmailBatch_status_runAfter_idx" ON "EmailBatch"("status", "runAfter");
CREATE INDEX "EmailBatch_teamId_status_idx" ON "EmailBatch"("teamId", "status");
CREATE INDEX "EmailBatch_lockedAt_idx" ON "EmailBatch"("lockedAt");
