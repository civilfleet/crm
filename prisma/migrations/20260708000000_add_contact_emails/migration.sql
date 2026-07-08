CREATE TYPE "ContactEmailKind" AS ENUM ('PRIMARY', 'ALIAS', 'SHARED');

CREATE TABLE "ContactEmail" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "kind" "ContactEmailKind" NOT NULL,
    "label" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ContactEmail_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ContactEmail" (
    "id",
    "teamId",
    "contactId",
    "email",
    "kind",
    "createdAt",
    "updatedAt"
)
SELECT
    md5("teamId" || ':' || "id" || ':' || lower(trim("email"))),
    "teamId",
    "id",
    lower(trim("email")),
    'PRIMARY'::"ContactEmailKind",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Contact"
WHERE "email" IS NOT NULL AND trim("email") <> '';

CREATE UNIQUE INDEX "ContactEmail_id_key" ON "ContactEmail"("id");
CREATE UNIQUE INDEX "ContactEmail_contactId_email_key" ON "ContactEmail"("contactId", "email");
CREATE INDEX "ContactEmail_teamId_email_idx" ON "ContactEmail"("teamId", "email");
CREATE INDEX "ContactEmail_contactId_idx" ON "ContactEmail"("contactId");
CREATE INDEX "ContactEmail_kind_idx" ON "ContactEmail"("kind");
CREATE UNIQUE INDEX "ContactEmail_identity_email_key"
    ON "ContactEmail"("teamId", "email")
    WHERE "kind" IN ('PRIMARY', 'ALIAS');
CREATE UNIQUE INDEX "ContactEmail_primary_contact_key"
    ON "ContactEmail"("contactId")
    WHERE "kind" = 'PRIMARY';

ALTER TABLE "ContactEmail"
    ADD CONSTRAINT "ContactEmail_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactEmail"
    ADD CONSTRAINT "ContactEmail_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Contact_teamId_email_key";
ALTER TABLE "Contact" DROP COLUMN "email";
