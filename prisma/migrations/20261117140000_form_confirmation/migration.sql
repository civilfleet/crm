-- E-mail confirmation of website form submissions (double opt-in):
-- the address and state per submission, pending consents, and the
-- per-form "count only confirmed" setting. docs/PUBLIC_FORMS_INTAKE.md.

-- AlterEnum
ALTER TYPE "ConsentStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "FormSetting" ADD COLUMN     "countConfirmedOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN     "confirmationRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "confirmationSentAt" TIMESTAMPTZ(6),
ADD COLUMN     "confirmedAt" TIMESTAMPTZ(6),
ADD COLUMN     "createdContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email" VARCHAR(255);

-- CreateIndex
CREATE INDEX "FormSubmission_confirmationRequested_confirmedAt_confirmati_idx" ON "FormSubmission"("confirmationRequested", "confirmedAt", "confirmationSentAt");

