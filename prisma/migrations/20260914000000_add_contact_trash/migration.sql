ALTER TABLE "Contact"
ADD COLUMN "deletedAt" TIMESTAMPTZ(6);

CREATE INDEX "Contact_teamId_deletedAt_idx"
ON "Contact"("teamId", "deletedAt");
