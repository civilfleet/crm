CREATE TYPE "SystemLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL,
    "teamId" TEXT,
    "level" "SystemLogLevel" NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "event" VARCHAR(120) NOT NULL,
    "message" TEXT NOT NULL,
    "workerId" VARCHAR(255),
    "entityType" VARCHAR(64),
    "entityId" VARCHAR(255),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemLog_id_key" ON "SystemLog"("id");
CREATE INDEX "SystemLog_teamId_createdAt_idx" ON "SystemLog"("teamId", "createdAt");
CREATE INDEX "SystemLog_level_createdAt_idx" ON "SystemLog"("level", "createdAt");
CREATE INDEX "SystemLog_source_createdAt_idx" ON "SystemLog"("source", "createdAt");
CREATE INDEX "SystemLog_entityType_entityId_idx" ON "SystemLog"("entityType", "entityId");

ALTER TABLE "SystemLog" ADD CONSTRAINT "SystemLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
