-- The hashed sender of a website submission, for the per-source e-mail limit.

-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN     "sourceKey" VARCHAR(64);

-- CreateIndex
CREATE INDEX "FormSubmission_sourceKey_confirmationSentAt_idx" ON "FormSubmission"("sourceKey", "confirmationSentAt");

