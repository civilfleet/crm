ALTER TABLE "EmailBatch"
ADD COLUMN "internalCopyMode" VARCHAR(32) NOT NULL DEFAULT 'summary',
ADD COLUMN "internalCopySentAt" TIMESTAMPTZ(6);
