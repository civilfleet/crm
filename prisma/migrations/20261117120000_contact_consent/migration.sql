-- What each contact agreed to (purpose, wording, source), append-only.
-- See docs/DATA_RULES.md, "Consent".

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('FORM', 'MANUAL', 'EXTERNAL');

-- CreateTable
CREATE TABLE "ContactConsent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "purpose" VARCHAR(64) NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "wording" TEXT,
    "locale" VARCHAR(10),
    "source" "ConsentSource" NOT NULL,
    "submissionId" UUID,
    "formId" VARCHAR(64),
    "recordedBy" VARCHAR(255),
    "recordedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactConsent_contactId_purpose_recordedAt_idx" ON "ContactConsent"("contactId", "purpose", "recordedAt");

-- CreateIndex
CREATE INDEX "ContactConsent_teamId_purpose_idx" ON "ContactConsent"("teamId", "purpose");

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

