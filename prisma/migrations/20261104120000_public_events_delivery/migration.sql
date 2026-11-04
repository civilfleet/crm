ALTER TABLE "Event" ADD COLUMN "countryCode" CHAR(2);
ALTER TABLE "EventRegistration" ADD COLUMN "submissionId" UUID;
CREATE UNIQUE INDEX "EventRegistration_submissionId_key" ON "EventRegistration"("submissionId");
-- Only infer locations where the existing centroid catalogue has one country.
UPDATE "Event" e SET "countryCode" = pc.country
FROM (SELECT "postalCode", min("countryCode") AS country
      FROM "PostalCodeCentroid" GROUP BY "postalCode"
      HAVING count(DISTINCT "countryCode") = 1) pc
WHERE upper(trim(e."postalCode")) = pc."postalCode";
