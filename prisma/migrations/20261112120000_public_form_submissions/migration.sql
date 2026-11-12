-- AlterEnum
ALTER TYPE "EngagementSource" ADD VALUE 'FORM';

-- AlterTable
ALTER TABLE "Teams" ADD COLUMN     "publicFormsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "submissionId" UUID NOT NULL,
    "teamId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "formId" VARCHAR(64) NOT NULL,
    "formTitle" VARCHAR(255) NOT NULL,
    "formRevision" VARCHAR(64) NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "page" VARCHAR(2048),
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMPTZ(6) NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_id_key" ON "FormSubmission"("id");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_submissionId_key" ON "FormSubmission"("submissionId");

-- CreateIndex
CREATE INDEX "FormSubmission_teamId_idx" ON "FormSubmission"("teamId");

-- CreateIndex
CREATE INDEX "FormSubmission_contactId_idx" ON "FormSubmission"("contactId");

-- CreateIndex
CREATE INDEX "FormSubmission_formId_idx" ON "FormSubmission"("formId");

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Proposed contact changes (intake data that would overwrite existing values)
ALTER TYPE "ChangeAction" ADD VALUE 'PROPOSED';
ALTER TYPE "ChangeAction" ADD VALUE 'PROPOSAL_REJECTED';

-- AlterTable
ALTER TABLE "ContactChangeLog" ADD COLUMN     "proposalId" TEXT;

-- CreateIndex
CREATE INDEX "ContactChangeLog_proposalId_idx" ON "ContactChangeLog"("proposalId");

-- One resolution (applied UPDATED or PROPOSAL_REJECTED) per proposal.
CREATE UNIQUE INDEX "ContactChangeLog_proposal_resolution_key"
    ON "ContactChangeLog"("proposalId")
    WHERE "proposalId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "ContactChangeLog" ADD CONSTRAINT "ContactChangeLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ContactChangeLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
