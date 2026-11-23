-- CreateEnum
CREATE TYPE "KlaviyoSyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "KlaviyoConsentSyncStatus" AS ENUM ('SENT', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "BackgroundWorkerHeartbeat" ADD COLUMN     "enabledKlaviyoCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "oldestKlaviyoSyncedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "IntegrationConnection" ADD COLUMN     "sendConsents" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "KlaviyoSyncJob" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" "KlaviyoSyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(6),
    "lockedBy" VARCHAR(255),
    "startedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "KlaviyoSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KlaviyoConsentSync" (
    "consentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" "KlaviyoConsentSyncStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "detail" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "KlaviyoConsentSync_pkey" PRIMARY KEY ("consentId")
);

-- CreateTable
CREATE TABLE "ContactImportBlock" (
    "teamId" TEXT NOT NULL,
    "emailHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactImportBlock_pkey" PRIMARY KEY ("teamId","emailHash")
);

-- CreateTable
CREATE TABLE "KlaviyoProfileDeletion" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "KlaviyoProfileDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KlaviyoSyncJob_status_runAfter_idx" ON "KlaviyoSyncJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "KlaviyoSyncJob_teamId_status_idx" ON "KlaviyoSyncJob"("teamId", "status");

-- CreateIndex
CREATE INDEX "KlaviyoSyncJob_lockedAt_idx" ON "KlaviyoSyncJob"("lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KlaviyoSyncJob_active_team_key" ON "KlaviyoSyncJob"("teamId") WHERE (status = ANY (ARRAY['PENDING'::"KlaviyoSyncJobStatus", 'RUNNING'::"KlaviyoSyncJobStatus"]));

-- CreateIndex
CREATE INDEX "KlaviyoConsentSync_teamId_status_idx" ON "KlaviyoConsentSync"("teamId", "status");

-- CreateIndex
CREATE INDEX "KlaviyoProfileDeletion_teamId_idx" ON "KlaviyoProfileDeletion"("teamId");

-- AddForeignKey
ALTER TABLE "KlaviyoSyncJob" ADD CONSTRAINT "KlaviyoSyncJob_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KlaviyoConsentSync" ADD CONSTRAINT "KlaviyoConsentSync_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "ContactConsent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactImportBlock" ADD CONSTRAINT "ContactImportBlock_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KlaviyoProfileDeletion" ADD CONSTRAINT "KlaviyoProfileDeletion_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

