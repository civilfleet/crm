-- AlterTable
ALTER TABLE "ContactEngagementUserState" ADD COLUMN "dismissedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "ContactEngagementUserState_teamId_userId_dismissedAt_idx" ON "ContactEngagementUserState"("teamId", "userId", "dismissedAt");
