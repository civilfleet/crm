import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Pool } from "pg";
import { publishEvents } from "../scripts/publish-public-events";
import {
  completePublication,
  failPublication,
  pendingPublication,
  reconcilePublication,
} from "../src/lib/public-data/queue";
import { loadPublishedCache } from "../src/lib/public-data/runtime";
import { readPublicData } from "../src/lib/public-data/source";

const url = process.env.PUBLIC_DATA_TEST_DATABASE_URL;
test("publication triggers, rollback, cascades, retry, and concurrent revisions on PostgreSQL", {
  skip: !url,
}, async () => {
  assert.equal(
    new URL(url ?? "").hostname,
    "127.0.0.1",
    "Integration test requires an isolated localhost database",
  );
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const schema = `public_data_test_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
    await client.query(`CREATE TABLE "Teams" (id text primary key, name text, email text, website text, "oidcClientSecret" text);
      CREATE TABLE "EventType" (id text primary key, "teamId" text REFERENCES "Teams" ON DELETE CASCADE, name text);
      CREATE TABLE "Event" (id text primary key, "teamId" text REFERENCES "Teams" ON DELETE CASCADE,
        "eventTypeId" text REFERENCES "EventType" ON DELETE SET NULL,
        "isPublic" boolean DEFAULT false, slug text, title text, description text, location text, city text,
        state text, "postalCode" text, "countryCode" text, "isOnline" boolean DEFAULT false,
        "startDate" timestamptz DEFAULT now(), "endDate" timestamptz, "timeZone" text, tags text[]);
      CREATE TABLE "PostalCodeCentroid" ("countryCode" text, "postalCode" text, latitude numeric, longitude numeric);`);
    await client.query(
      await readFile(
        "prisma/migrations/20261105170000_public_data_publication/migration.sql",
        "utf8",
      ),
    );
    await client.query(`INSERT INTO "Teams" VALUES ('team', 'Public name', 'public@example.org', NULL, 'never-export');
      INSERT INTO "EventType" VALUES ('type', 'team', 'Meetup');
      INSERT INTO "Event" (id, "teamId", "eventTypeId", title) VALUES ('event', 'team', 'type', 'Private');`);
    assert.equal(
      (await client.query('SELECT * FROM "PublicDataPublicationState"'))
        .rowCount,
      0,
    );
    await client.query("BEGIN");
    await client.query(
      `UPDATE "Event" SET "isPublic" = true WHERE id = 'event'`,
    );
    assert.equal(
      (await client.query('SELECT * FROM "PublicDataPublicationState"'))
        .rowCount,
      1,
    );
    await client.query("ROLLBACK");
    assert.equal(
      (await client.query('SELECT * FROM "PublicDataPublicationState"'))
        .rowCount,
      0,
    );
    await client.query(
      `UPDATE "Event" SET "isPublic" = true WHERE id = 'event'`,
    );
    assert.equal(
      (await pendingPublication(client, 30)).length,
      0,
      "Debounce delays publication",
    );
    const captured = await pendingPublication(client, 0);
    assert.equal(captured.length, 1);
    await client.query(
      `UPDATE "Event" SET tags = ARRAY['private-tag'] WHERE id = 'event'`,
    );
    assert.deepEqual(
      await pendingPublication(client, 0),
      captured,
      "Non-exported fields do not dirty publication",
    );
    await client.query(
      `UPDATE "Event" SET description = 'New public text' WHERE id = 'event'`,
    );
    await completePublication(client, captured);
    assert.equal(
      (await pendingPublication(client, 0)).length,
      1,
      "A change during deployment remains pending",
    );
    const current = await pendingPublication(client, 0);
    await failPublication(client, current);
    assert.equal(
      (await pendingPublication(client, 0)).length,
      0,
      "Failed requests back off",
    );
    await client.query(
      'UPDATE "PublicDataPublicationState" SET "nextAttemptAt" = now()',
    );
    assert.equal((await pendingPublication(client, 0)).length, 1);
    const data = await readPublicData(client, null, true);
    assert.equal(data.teams.length, 1);
    assert.ok(!JSON.stringify(data).includes("never-export"));
    await completePublication(client, await pendingPublication(client, 0));
    await client.query(
      `UPDATE "EventType" SET name = 'New label' WHERE id = 'type'`,
    );
    assert.equal((await pendingPublication(client, 0)).length, 1);
    await completePublication(client, await pendingPublication(client, 0));
    await client.query(`DELETE FROM "EventType" WHERE id = 'type'`);
    assert.equal(
      (await pendingPublication(client, 0)).length,
      1,
      "SET NULL cascade dirties affected public events",
    );
    await completePublication(client, await pendingPublication(client, 0));
    await client.query(`DELETE FROM "Teams" WHERE id = 'team'`);
    assert.equal(
      (await pendingPublication(client, 0)).length,
      1,
      "Team deletion preserves a tombstone",
    );
    assert.equal(
      (await readPublicData(client, ["team"], true)).teams.length,
      0,
    );
    await completePublication(client, await pendingPublication(client, 0));
    await reconcilePublication(client);
    assert.equal(
      (await pendingPublication(client, 0)).length,
      1,
      "Daily reconciliation retains deleted-team tombstones",
    );
    // Run the publisher against the same isolated schema with a mocked Netlify API.
    await client.query(`INSERT INTO "Teams" VALUES ('publisher-team', 'Publisher fixture', 'public@example.org', NULL, 'never-export');
      INSERT INTO "Event" (id, "teamId", title, description, "isPublic", "startDate")
      VALUES ('publisher-event', 'publisher-team', 'Verification', 'Original', true, '2050-01-01');`);
    const cache = await mkdtemp(join(tmpdir(), "public-data-publisher-"));
    const keys = [
      "DATABASE_URL",
      "PUBLIC_DATA_STATE_DIR",
      "NETLIFY_AUTH_TOKEN",
      "PG_SSL_ROOT_CERT",
    ];
    const saved = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    const originalFetch = globalThis.fetch;
    const isolated = new URL(url ?? "");
    isolated.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = isolated.toString();
    process.env.PUBLIC_DATA_STATE_DIR = cache;
    process.env.NETLIFY_AUTH_TOKEN = "fixture-token";
    delete process.env.PG_SSL_ROOT_CERT;
    let active: { id: string; title: string } | undefined;
    let candidate: { id: string; title: string; draft: boolean } | undefined;
    let lockedCandidate = false,
      abandonedUpload = false,
      cancelledUpload = false;
    let creates = 0,
      failCreate = false,
      editDuringDeploy = false;
    try {
      globalThis.fetch = async (input, init) => {
        const request = new URL(String(input));
        assert.equal(request.hostname, "api.netlify.com");
        if (init?.method === "POST" && request.pathname.endsWith("/deploys")) {
          if (failCreate)
            return new Response("fixture failure", { status: 500 });
          const body = JSON.parse(String(init.body));
          assert.ok(body.files["/manifest.json"]);
          assert.ok(
            !Object.keys(body.files).some((key) => key.endsWith(".html")),
          );
          candidate = {
            id: `deploy-${++creates}`,
            title: body.title,
            draft: body.draft,
          };
          if (editDuringDeploy) {
            editDuringDeploy = false;
            await client.query(
              `UPDATE "Event" SET description = 'Changed during deployment' WHERE id = 'publisher-event'`,
            );
          }
          if (!candidate.draft && !lockedCandidate) active = candidate;
          return Response.json({ ...candidate, state: "ready", required: [] });
        }
        if (request.pathname.endsWith("/cancel")) {
          cancelledUpload = true;
          return Response.json({ state: "error" });
        }
        if (request.pathname.endsWith("/deploys"))
          return Response.json(
            abandonedUpload && !cancelledUpload
              ? [
                  {
                    id: "abandoned",
                    state: "preparing",
                    title: "public-data:abandoned",
                  },
                ]
              : [],
          );
        if (request.pathname.endsWith("/deploys/abandoned"))
          return Response.json({ required: ["b".repeat(40)] });
        if (request.pathname.startsWith("/api/v1/deploys/"))
          return Response.json({ ...candidate, state: "ready", required: [] });
        return Response.json({
          published_deploy: active,
          ssl_url: "https://fixture.example.org",
        });
      };
      const revision = async () =>
        (
          await client.query(
            `SELECT "publishedRevision"::text AS published, "requestedRevision"::text AS requested FROM "PublicDataPublicationState" WHERE "teamId" = 'publisher-team'`,
          )
        ).rows[0];
      await publishEvents(false);
      assert.equal(
        (await revision()).published,
        "0",
        "Draft must not acknowledge the queue",
      );
      assert.equal(
        await loadPublishedCache(),
        undefined,
        "Draft must not promote the production cache",
      );
      editDuringDeploy = true;
      await publishEvents(true);
      assert.notEqual(
        (await revision()).published,
        (await revision()).requested,
        "Concurrent change remains pending",
      );
      assert.ok(await loadPublishedCache());
      await client.query(
        `UPDATE "PublicDataPublicationState" SET "lastChangedAt" = now() - interval '31 seconds'`,
      );
      await publishEvents(true, { queued: true });
      assert.equal((await revision()).published, (await revision()).requested);
      const pointer = await readFile(join(cache, "current.json"), "utf8");
      await client.query(`UPDATE "Event" SET title = 'Retry verification' WHERE id = 'publisher-event';
        UPDATE "PublicDataPublicationState" SET "lastChangedAt" = now() - interval '31 seconds'`);
      failCreate = true;
      await assert.rejects(publishEvents(true, { queued: true }));
      assert.equal(
        await readFile(join(cache, "current.json"), "utf8"),
        pointer,
        "Failed upload keeps the successful cache",
      );
      assert.notEqual(
        (await revision()).published,
        (await revision()).requested,
      );
      failCreate = false;
      await client.query(
        'UPDATE "PublicDataPublicationState" SET "nextAttemptAt" = now()',
      );
      await publishEvents(true, { queued: true });
      assert.equal((await revision()).published, (await revision()).requested);
      await client.query(`UPDATE "Event" SET title = 'Recover abandoned upload' WHERE id = 'publisher-event';
        UPDATE "PublicDataPublicationState" SET "lastChangedAt" = now() - interval '31 seconds', "nextAttemptAt" = now()`);
      abandonedUpload = true;
      await publishEvents(true, { queued: true });
      assert.equal(
        cancelledUpload,
        true,
        "Interrupted own upload is cancelled and retried under the publication lock",
      );
      await client.query(`UPDATE "Event" SET title = 'Locked publication' WHERE id = 'publisher-event';
        UPDATE "PublicDataPublicationState" SET "lastChangedAt" = now() - interval '31 seconds', "nextAttemptAt" = now()`);
      lockedCandidate = true;
      await assert.rejects(
        publishEvents(true, { queued: true }),
        /not published/,
      );
      assert.notEqual(
        (await revision()).published,
        (await revision()).requested,
        "Ready but inactive deploy must not acknowledge requests",
      );
      lockedCandidate = false;
      await client.query(
        'UPDATE "PublicDataPublicationState" SET "nextAttemptAt" = now()',
      );
      await publishEvents(true, { queued: true });
      await rm(join(cache, "current.json"));
      await publishEvents(true);
      assert.ok(
        await loadPublishedCache(),
        "Cold cache is reconstructed from source",
      );
    } finally {
      globalThis.fetch = originalFetch;
      for (const key of keys) {
        const value = saved[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await rm(cache, { recursive: true, force: true });
    }
  } finally {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    client.release();
    await pool.end();
  }
});
