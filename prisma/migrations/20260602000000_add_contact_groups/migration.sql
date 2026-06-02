CREATE TABLE "ContactGroup" (
    "contactId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactGroup_pkey" PRIMARY KEY ("contactId","groupId")
);

INSERT INTO "ContactGroup" ("contactId", "groupId")
SELECT "id", "groupId"
FROM "Contact"
WHERE "groupId" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX "ContactGroup_contactId_idx" ON "ContactGroup"("contactId");

CREATE INDEX "ContactGroup_groupId_idx" ON "ContactGroup"("groupId");

ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
