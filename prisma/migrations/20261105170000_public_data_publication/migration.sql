-- No foreign key: a team's deletion must leave a durable publication tombstone.
CREATE TABLE "PublicDataPublicationState" (
  "teamId" TEXT PRIMARY KEY,
  "requestedRevision" BIGINT NOT NULL DEFAULT 1,
  "publishedRevision" BIGINT NOT NULL DEFAULT 0,
  "lastChangedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lastPublishedAt" TIMESTAMPTZ(6)
);

CREATE FUNCTION request_public_data_publication(team_id TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF team_id IS NULL THEN RETURN; END IF;
  INSERT INTO "PublicDataPublicationState" ("teamId", "lastChangedAt", "nextAttemptAt")
  VALUES (team_id, clock_timestamp(), clock_timestamp())
  ON CONFLICT ("teamId") DO UPDATE SET
    "requestedRevision" = "PublicDataPublicationState"."requestedRevision" + 1,
    "lastChangedAt" = clock_timestamp();
END;
$$;

-- Triggers enqueue in the writer's transaction, including imports and cascades.
CREATE FUNCTION public_data_event_changed() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."isPublic" THEN PERFORM request_public_data_publication(OLD."teamId"); END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD."teamId", OLD."isPublic", OLD.slug, OLD.title, OLD.description,
      OLD.location, OLD.city, OLD.state, OLD."postalCode", OLD."countryCode",
      OLD."isOnline", OLD."startDate", OLD."endDate", OLD."timeZone", OLD."eventTypeId")
      IS NOT DISTINCT FROM
      ROW(NEW."teamId", NEW."isPublic", NEW.slug, NEW.title, NEW.description,
      NEW.location, NEW.city, NEW.state, NEW."postalCode", NEW."countryCode",
      NEW."isOnline", NEW."startDate", NEW."endDate", NEW."timeZone", NEW."eventTypeId")
    THEN RETURN NEW; END IF;
    IF OLD."isPublic" AND (NOT NEW."isPublic" OR OLD."teamId" <> NEW."teamId") THEN
      PERFORM request_public_data_publication(OLD."teamId");
    END IF;
  END IF;
  IF NEW."isPublic" THEN PERFORM request_public_data_publication(NEW."teamId"); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER public_data_event_change AFTER INSERT OR UPDATE OR DELETE ON "Event"
FOR EACH ROW EXECUTE FUNCTION public_data_event_changed();

CREATE FUNCTION public_data_team_changed() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM request_public_data_publication(OLD.id);
    RETURN OLD;
  END IF;
  IF ROW(OLD.name, OLD.email, OLD.website) IS DISTINCT FROM ROW(NEW.name, NEW.email, NEW.website)
    AND EXISTS (SELECT 1 FROM "Event" WHERE "teamId" = NEW.id AND "isPublic") THEN
    PERFORM request_public_data_publication(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER public_data_team_change AFTER UPDATE OR DELETE ON "Teams"
FOR EACH ROW EXECUTE FUNCTION public_data_team_changed();

CREATE FUNCTION public_data_event_type_changed() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    PERFORM request_public_data_publication(e."teamId") FROM
      (SELECT DISTINCT "teamId" FROM "Event" WHERE "eventTypeId" = NEW.id AND "isPublic") e;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER public_data_event_type_change AFTER UPDATE ON "EventType"
FOR EACH ROW EXECUTE FUNCTION public_data_event_type_changed();

INSERT INTO "PublicDataPublicationState" ("teamId")
SELECT DISTINCT "teamId" FROM "Event" WHERE "isPublic";
