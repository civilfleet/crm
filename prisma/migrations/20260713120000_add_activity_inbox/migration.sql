-- CreateTable
CREATE TABLE "ContactEngagementInboxState" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "initializedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readThroughAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContactEngagementInboxState_pkey" PRIMARY KEY ("teamId", "userId")
);

-- CreateTable
CREATE TABLE "ContactEngagementUserState" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContactEngagementUserState_pkey" PRIMARY KEY ("engagementId", "userId")
);

-- CreateIndex
CREATE INDEX "ContactEngagementInboxState_userId_idx" ON "ContactEngagementInboxState"("userId");

-- CreateIndex
CREATE INDEX "ContactEngagementUserState_teamId_userId_isRead_idx" ON "ContactEngagementUserState"("teamId", "userId", "isRead");

-- CreateIndex
CREATE INDEX "ContactEngagementUserState_userId_idx" ON "ContactEngagementUserState"("userId");

-- AddForeignKey
ALTER TABLE "ContactEngagementInboxState" ADD CONSTRAINT "ContactEngagementInboxState_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEngagementInboxState" ADD CONSTRAINT "ContactEngagementInboxState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEngagementUserState" ADD CONSTRAINT "ContactEngagementUserState_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEngagementUserState" ADD CONSTRAINT "ContactEngagementUserState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEngagementUserState" ADD CONSTRAINT "ContactEngagementUserState_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ContactEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
