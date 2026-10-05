CREATE TYPE "InboundEmailAuthenticationStatus" AS ENUM ('PASS', 'FAIL', 'UNKNOWN');

ALTER TABLE "InboundEmailMessage"
ADD COLUMN "authenticationStatus" "InboundEmailAuthenticationStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "authenticationDetails" JSONB;

CREATE INDEX "InboundEmailMessage_authenticationStatus_idx"
ON "InboundEmailMessage"("authenticationStatus");
