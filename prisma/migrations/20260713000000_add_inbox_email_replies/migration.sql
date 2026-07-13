CREATE TYPE "EmailInboxOutboundMode" AS ENUM ('DISABLED', 'SMTP', 'SCALEWAY');

ALTER TABLE "EmailInbox"
ADD COLUMN "outboundMode" "EmailInboxOutboundMode" NOT NULL DEFAULT 'DISABLED',
ADD COLUMN "replyFromEmail" VARCHAR(255),
ADD COLUMN "replyFromName" VARCHAR(255),
ADD COLUMN "smtpHost" VARCHAR(255),
ADD COLUMN "smtpPort" INTEGER,
ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smtpUsername" VARCHAR(255),
ADD COLUMN "smtpPasswordEncrypted" TEXT;

ALTER TABLE "ContactEngagement"
ADD COLUMN "emailInboxId" TEXT,
ADD COLUMN "replyToEngagementId" TEXT;

CREATE INDEX "ContactEngagement_emailInboxId_idx" ON "ContactEngagement"("emailInboxId");
CREATE INDEX "ContactEngagement_replyToEngagementId_idx" ON "ContactEngagement"("replyToEngagementId");

ALTER TABLE "ContactEngagement"
ADD CONSTRAINT "ContactEngagement_emailInboxId_fkey"
FOREIGN KEY ("emailInboxId") REFERENCES "EmailInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContactEngagement"
ADD CONSTRAINT "ContactEngagement_replyToEngagementId_fkey"
FOREIGN KEY ("replyToEngagementId") REFERENCES "ContactEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
