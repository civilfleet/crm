ALTER TABLE "Organization"
ADD COLUMN "portalAccessEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Organization"
SET "portalAccessEnabled" = true
WHERE "isFilledByOrg" = true
   OR EXISTS (
     SELECT 1
     FROM "_OrganizationUsers"
     WHERE "_OrganizationUsers"."A" = "Organization"."id"
   );
