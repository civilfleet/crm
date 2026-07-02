CREATE TYPE "ContactAccessReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

CREATE TABLE "EmailInbox" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "username" VARCHAR(255) NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "mailbox" VARCHAR(255) NOT NULL DEFAULT 'INBOX',
    "autoApproveExistingVisible" BOOLEAN NOT NULL DEFAULT true,
    "requireReviewForHiddenMatches" BOOLEAN NOT NULL DEFAULT true,
    "allowCreateContacts" BOOLEAN NOT NULL DEFAULT false,
    "allowedDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "uidValidity" BIGINT,
    "lastUid" BIGINT,
    "syncLockedAt" TIMESTAMPTZ(6),
    "syncLockedBy" VARCHAR(255),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EmailInbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundEmailMessage" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "emailInboxId" TEXT NOT NULL,
    "mailbox" VARCHAR(255) NOT NULL,
    "uidValidity" BIGINT NOT NULL,
    "uid" BIGINT NOT NULL,
    "messageId" VARCHAR(500),
    "fromEmail" VARCHAR(255) NOT NULL,
    "fromName" VARCHAR(255),
    "subject" VARCHAR(500),
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL,
    "contactId" TEXT,
    "engagementId" TEXT,
    "rawHeaders" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactAccessReview" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "inboundEmailMessageId" TEXT,
    "status" "ContactAccessReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewedByUserId" TEXT,
    "reviewedByUserName" VARCHAR(255),
    "revokedAt" TIMESTAMPTZ(6),
    "revokedByUserId" TEXT,
    "revokedByUserName" VARCHAR(255),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContactAccessReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailInbox_id_key" ON "EmailInbox"("id");
CREATE INDEX "EmailInbox_teamId_idx" ON "EmailInbox"("teamId");
CREATE INDEX "EmailInbox_groupId_idx" ON "EmailInbox"("groupId");
CREATE INDEX "EmailInbox_isEnabled_idx" ON "EmailInbox"("isEnabled");
CREATE INDEX "EmailInbox_syncLockedAt_idx" ON "EmailInbox"("syncLockedAt");

CREATE UNIQUE INDEX "InboundEmailMessage_id_key" ON "InboundEmailMessage"("id");
CREATE UNIQUE INDEX "InboundEmailMessage_emailInboxId_mailbox_uidValidity_uid_key" ON "InboundEmailMessage"("emailInboxId", "mailbox", "uidValidity", "uid");
CREATE INDEX "InboundEmailMessage_teamId_fromEmail_idx" ON "InboundEmailMessage"("teamId", "fromEmail");
CREATE INDEX "InboundEmailMessage_groupId_idx" ON "InboundEmailMessage"("groupId");
CREATE INDEX "InboundEmailMessage_messageId_idx" ON "InboundEmailMessage"("messageId");
CREATE INDEX "InboundEmailMessage_contactId_idx" ON "InboundEmailMessage"("contactId");
CREATE INDEX "InboundEmailMessage_engagementId_idx" ON "InboundEmailMessage"("engagementId");

CREATE UNIQUE INDEX "ContactAccessReview_id_key" ON "ContactAccessReview"("id");
CREATE UNIQUE INDEX "ContactAccessReview_source_inboundEmailMessageId_groupId_contactId_key" ON "ContactAccessReview"("source", "inboundEmailMessageId", "groupId", "contactId");
CREATE INDEX "ContactAccessReview_teamId_status_idx" ON "ContactAccessReview"("teamId", "status");
CREATE INDEX "ContactAccessReview_groupId_status_idx" ON "ContactAccessReview"("groupId", "status");
CREATE INDEX "ContactAccessReview_contactId_idx" ON "ContactAccessReview"("contactId");
CREATE INDEX "ContactAccessReview_source_idx" ON "ContactAccessReview"("source");

ALTER TABLE "EmailInbox" ADD CONSTRAINT "EmailInbox_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailInbox" ADD CONSTRAINT "EmailInbox_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundEmailMessage" ADD CONSTRAINT "InboundEmailMessage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundEmailMessage" ADD CONSTRAINT "InboundEmailMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundEmailMessage" ADD CONSTRAINT "InboundEmailMessage_emailInboxId_fkey" FOREIGN KEY ("emailInboxId") REFERENCES "EmailInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundEmailMessage" ADD CONSTRAINT "InboundEmailMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboundEmailMessage" ADD CONSTRAINT "InboundEmailMessage_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ContactEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactAccessReview" ADD CONSTRAINT "ContactAccessReview_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactAccessReview" ADD CONSTRAINT "ContactAccessReview_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactAccessReview" ADD CONSTRAINT "ContactAccessReview_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactAccessReview" ADD CONSTRAINT "ContactAccessReview_inboundEmailMessageId_fkey" FOREIGN KEY ("inboundEmailMessageId") REFERENCES "InboundEmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
