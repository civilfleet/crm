-- Why a confirmation e-mail was not sent, so limits count only those sent.
-- Submissions handled before this column existed and marked handled
-- without being confirmed are taken as sent: the safe side for the limit.

-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN     "confirmationSkipped" VARCHAR(32);

