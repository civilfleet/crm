ALTER TABLE "Organization"
ADD COLUMN "deletedAt" TIMESTAMPTZ(6);

CREATE INDEX "Organization_teamId_deletedAt_idx"
ON "Organization"("teamId", "deletedAt");
