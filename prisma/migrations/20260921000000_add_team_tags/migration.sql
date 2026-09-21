CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Contact" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Organization" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ContactList" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ContactEngagement" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "OrganizationEngagement" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Event" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "File" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "Tag_teamId_name_key" ON "Tag"("teamId", "name");
CREATE INDEX "Contact_tags_idx" ON "Contact" USING GIN ("tags");
CREATE INDEX "Organization_tags_idx" ON "Organization" USING GIN ("tags");
CREATE INDEX "ContactList_tags_idx" ON "ContactList" USING GIN ("tags");
CREATE INDEX "ContactEngagement_tags_idx" ON "ContactEngagement" USING GIN ("tags");
CREATE INDEX "OrganizationEngagement_tags_idx" ON "OrganizationEngagement" USING GIN ("tags");
CREATE INDEX "Event_tags_idx" ON "Event" USING GIN ("tags");
CREATE INDEX "File_tags_idx" ON "File" USING GIN ("tags");

ALTER TABLE "Tag" ADD CONSTRAINT "Tag_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
