-- Contacts sort by their primary e-mail address. The address lives in
-- "ContactEmail" (one row per address), which a database cannot order
-- contacts by, so each contact keeps a copy in "primaryEmail". A trigger
-- keeps the copy in step with every write to "ContactEmail", whichever code
-- path makes it (forms, imports, merges, website intake).

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "primaryEmail" VARCHAR(255);

-- Backfill from the addresses there are.
UPDATE "Contact" c
SET "primaryEmail" = e."email"
FROM "ContactEmail" e
WHERE e."contactId" = c."id" AND e."kind" = 'PRIMARY';

-- CreateIndex
CREATE INDEX "Contact_active_primaryEmail_idx" ON "Contact"("teamId", "primaryEmail", "id") WHERE ("deletedAt" IS NULL);

CREATE FUNCTION contact_primary_email_sync() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE "Contact"
    SET "primaryEmail" = (
      SELECT "email" FROM "ContactEmail"
      WHERE "contactId" = OLD."contactId" AND "kind" = 'PRIMARY'
      LIMIT 1
    )
    WHERE "id" = OLD."contactId";
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE "Contact"
    SET "primaryEmail" = (
      SELECT "email" FROM "ContactEmail"
      WHERE "contactId" = NEW."contactId" AND "kind" = 'PRIMARY'
      LIMIT 1
    )
    WHERE "id" = NEW."contactId";
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER contact_primary_email_sync
AFTER INSERT OR UPDATE OR DELETE ON "ContactEmail"
FOR EACH ROW EXECUTE FUNCTION contact_primary_email_sync();
