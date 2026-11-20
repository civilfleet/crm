-- AlterTable
ALTER TABLE "FormSubmission" ADD COLUMN     "confirmationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "confirmationError" VARCHAR(255),
ADD COLUMN     "confirmationFailedAt" TIMESTAMPTZ(6),
ADD COLUMN     "confirmationRetryAt" TIMESTAMPTZ(6);
