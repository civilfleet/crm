-- CreateEnum
CREATE TYPE "EmailAttachmentDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "EmailAttachmentStatus" AS ENUM ('AVAILABLE', 'BLOCKED', 'OMITTED');

-- AlterTable
ALTER TABLE "InboundEmailMessage"
ADD COLUMN "replyToEmail" VARCHAR(255),
ADD COLUMN "replyToName" VARCHAR(255);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "inboundEmailMessageId" TEXT,
    "engagementId" TEXT,
    "direction" "EmailAttachmentDirection" NOT NULL,
    "status" "EmailAttachmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "storageKey" VARCHAR(1024),
    "fileName" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(255) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentId" VARCHAR(500),
    "disposition" VARCHAR(32),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailAttachment_id_key" ON "EmailAttachment"("id");
CREATE UNIQUE INDEX "EmailAttachment_storageKey_key" ON "EmailAttachment"("storageKey");
CREATE INDEX "EmailAttachment_teamId_idx" ON "EmailAttachment"("teamId");
CREATE INDEX "EmailAttachment_inboundEmailMessageId_idx" ON "EmailAttachment"("inboundEmailMessageId");
CREATE INDEX "EmailAttachment_engagementId_idx" ON "EmailAttachment"("engagementId");

ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_inboundEmailMessageId_fkey" FOREIGN KEY ("inboundEmailMessageId") REFERENCES "InboundEmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ContactEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_exactly_one_parent_check"
CHECK (("inboundEmailMessageId" IS NOT NULL)::int + ("engagementId" IS NOT NULL)::int = 1);
