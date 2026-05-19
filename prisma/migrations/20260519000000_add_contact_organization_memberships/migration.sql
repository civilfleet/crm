CREATE TABLE "ContactOrganization" (
  "contactId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactOrganization_pkey" PRIMARY KEY ("contactId", "organizationId")
);

CREATE INDEX "ContactOrganization_organizationId_idx"
ON "ContactOrganization"("organizationId");

ALTER TABLE "ContactOrganization"
ADD CONSTRAINT "ContactOrganization_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactOrganization"
ADD CONSTRAINT "ContactOrganization_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
