CREATE TYPE "EmailSuppressionReason" AS ENUM (
    'HARD_BOUNCE',
    'SPAM',
    'UNSUBSCRIBED',
    'MANUAL'
);

CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "reason" "EmailSuppressionReason" NOT NULL,
    "detail" TEXT,
    "providerMessageId" VARCHAR(255),
    "createdByUserId" TEXT,
    "createdByUserName" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailDeliveryEvent" (
    "eventId" VARCHAR(255) NOT NULL,
    "teamId" TEXT NOT NULL,
    "providerMessageId" VARCHAR(255) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(6),
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDeliveryEvent_pkey" PRIMARY KEY ("eventId")
);

CREATE UNIQUE INDEX "EmailSuppression_teamId_email_key"
ON "EmailSuppression"("teamId", "email");
CREATE INDEX "EmailSuppression_teamId_reason_idx"
ON "EmailSuppression"("teamId", "reason");
CREATE INDEX "EmailDeliveryEvent_teamId_receivedAt_idx"
ON "EmailDeliveryEvent"("teamId", "receivedAt");
CREATE INDEX "EmailDeliveryEvent_providerMessageId_idx"
ON "EmailDeliveryEvent"("providerMessageId");

ALTER TABLE "EmailSuppression"
ADD CONSTRAINT "EmailSuppression_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailDeliveryEvent"
ADD CONSTRAINT "EmailDeliveryEvent_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
