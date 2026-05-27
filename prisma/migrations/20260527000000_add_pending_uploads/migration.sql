CREATE TABLE "PendingUpload" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "originalName" VARCHAR(255),
    "contentType" VARCHAR(255),
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "consumedByFileId" TEXT,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingUpload_id_key" ON "PendingUpload"("id");
CREATE UNIQUE INDEX "PendingUpload_key_key" ON "PendingUpload"("key");
CREATE INDEX "PendingUpload_teamId_userId_consumedAt_idx" ON "PendingUpload"("teamId", "userId", "consumedAt");
CREATE INDEX "PendingUpload_expiresAt_consumedAt_idx" ON "PendingUpload"("expiresAt", "consumedAt");

ALTER TABLE "PendingUpload" ADD CONSTRAINT "PendingUpload_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PendingUpload" ADD CONSTRAINT "PendingUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
