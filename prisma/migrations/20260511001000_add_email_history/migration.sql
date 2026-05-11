CREATE TYPE "EmailBatchStatus" AS ENUM ('SENDING', 'SENT', 'PARTIAL', 'FAILED');

CREATE TYPE "EmailRecipientStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED', 'DELIVERED', 'BOUNCED');

CREATE TABLE "EmailBatch" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "subject" VARCHAR(500) NOT NULL,
  "html" TEXT NOT NULL,
  "text" TEXT,
  "senderEmail" VARCHAR(255),
  "senderName" VARCHAR(255),
  "status" "EmailBatchStatus" NOT NULL DEFAULT 'SENDING',
  "requestedCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "userId" TEXT,
  "userName" VARCHAR(255),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "EmailBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailBatch_id_key" ON "EmailBatch"("id");
CREATE INDEX "EmailBatch_teamId_createdAt_idx" ON "EmailBatch"("teamId", "createdAt");
CREATE INDEX "EmailBatch_status_idx" ON "EmailBatch"("status");

CREATE TABLE "EmailRecipient" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "contactId" TEXT,
  "email" VARCHAR(255) NOT NULL,
  "name" VARCHAR(255),
  "status" "EmailRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" VARCHAR(255),
  "errorMessage" TEXT,
  "sentAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "EmailRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailRecipient_id_key" ON "EmailRecipient"("id");
CREATE INDEX "EmailRecipient_batchId_idx" ON "EmailRecipient"("batchId");
CREATE INDEX "EmailRecipient_contactId_idx" ON "EmailRecipient"("contactId");
CREATE INDEX "EmailRecipient_email_idx" ON "EmailRecipient"("email");
CREATE INDEX "EmailRecipient_status_idx" ON "EmailRecipient"("status");

ALTER TABLE "EmailBatch"
ADD CONSTRAINT "EmailBatch_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailRecipient"
ADD CONSTRAINT "EmailRecipient_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "EmailBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailRecipient"
ADD CONSTRAINT "EmailRecipient_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
