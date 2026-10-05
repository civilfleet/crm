ALTER TYPE "EmailRecipientStatus" ADD VALUE 'DISPATCHING' AFTER 'PENDING';
ALTER TYPE "EmailRecipientStatus" ADD VALUE 'UNKNOWN';

CREATE TYPE "EmailReplyDispatchStatus" AS ENUM (
  'PENDING',
  'DISPATCHING',
  'SENT',
  'FAILED',
  'UNKNOWN'
);

ALTER TABLE "EmailRecipient"
ADD COLUMN "dispatchStartedAt" TIMESTAMPTZ(6);

CREATE TABLE "EmailInternalCopyRecipient" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "status" "EmailRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" VARCHAR(255),
  "errorMessage" TEXT,
  "dispatchStartedAt" TIMESTAMPTZ(6),
  "sentAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "EmailInternalCopyRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailInternalCopyRecipient_id_key" ON "EmailInternalCopyRecipient"("id");
CREATE UNIQUE INDEX "EmailInternalCopyRecipient_batchId_email_key" ON "EmailInternalCopyRecipient"("batchId", "email");
CREATE INDEX "EmailInternalCopyRecipient_batchId_status_idx" ON "EmailInternalCopyRecipient"("batchId", "status");

ALTER TABLE "EmailInternalCopyRecipient"
ADD CONSTRAINT "EmailInternalCopyRecipient_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "EmailBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailReplyDispatch" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "emailInboxId" TEXT NOT NULL,
  "inboundEmailMessageId" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(64) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "transport" "EmailInboxOutboundMode" NOT NULL,
  "status" "EmailReplyDispatchStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" VARCHAR(255),
  "engagementId" TEXT,
  "dispatchStartedAt" TIMESTAMPTZ(6),
  "sentAt" TIMESTAMPTZ(6),
  "errorMessage" TEXT,
  "userId" TEXT NOT NULL,
  "userName" VARCHAR(255),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "EmailReplyDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailReplyDispatch_id_key" ON "EmailReplyDispatch"("id");
CREATE UNIQUE INDEX "EmailReplyDispatch_engagementId_key" ON "EmailReplyDispatch"("engagementId");
CREATE UNIQUE INDEX "EmailReplyDispatch_teamId_idempotencyKey_key" ON "EmailReplyDispatch"("teamId", "idempotencyKey");
CREATE INDEX "EmailReplyDispatch_emailInboxId_idx" ON "EmailReplyDispatch"("emailInboxId");
CREATE INDEX "EmailReplyDispatch_inboundEmailMessageId_idx" ON "EmailReplyDispatch"("inboundEmailMessageId");
CREATE INDEX "EmailReplyDispatch_status_dispatchStartedAt_idx" ON "EmailReplyDispatch"("status", "dispatchStartedAt");

ALTER TABLE "EmailReplyDispatch"
ADD CONSTRAINT "EmailReplyDispatch_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailReplyDispatch"
ADD CONSTRAINT "EmailReplyDispatch_emailInboxId_fkey"
FOREIGN KEY ("emailInboxId") REFERENCES "EmailInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailReplyDispatch"
ADD CONSTRAINT "EmailReplyDispatch_inboundEmailMessageId_fkey"
FOREIGN KEY ("inboundEmailMessageId") REFERENCES "InboundEmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailReplyDispatch"
ADD CONSTRAINT "EmailReplyDispatch_engagementId_fkey"
FOREIGN KEY ("engagementId") REFERENCES "ContactEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
