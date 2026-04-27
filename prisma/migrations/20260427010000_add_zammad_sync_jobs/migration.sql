CREATE TYPE "ZammadSyncJobType" AS ENUM ('INCREMENTAL_SYNC', 'FULL_SYNC', 'TICKET_SYNC');
CREATE TYPE "ZammadSyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "ZammadSyncJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teamId" UUID NOT NULL,
    "type" "ZammadSyncJobType" NOT NULL,
    "status" "ZammadSyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "ticketId" INTEGER,
    "payload" JSONB,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "lockedAt" TIMESTAMPTZ(6),
    "lockedBy" VARCHAR(255),
    "startedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ZammadSyncJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ZammadSyncJob"
ADD CONSTRAINT "ZammadSyncJob_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ZammadSyncJob_status_runAfter_idx" ON "ZammadSyncJob"("status", "runAfter");
CREATE INDEX "ZammadSyncJob_teamId_status_idx" ON "ZammadSyncJob"("teamId", "status");
CREATE INDEX "ZammadSyncJob_lockedAt_idx" ON "ZammadSyncJob"("lockedAt");
