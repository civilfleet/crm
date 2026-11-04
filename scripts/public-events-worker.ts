import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { publishEvents } from "./publish-public-events";

async function main() {
  const config = JSON.parse(
    await readFile("config/public-events.json", "utf8"),
  ) as { teamIds: string[] };
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    ssl: process.env.PG_SSL_ROOT_CERT
      ? {
          ca: process.env.PG_SSL_ROOT_CERT.replace(/\\n/g, "\n"),
          rejectUnauthorized: true,
        }
      : undefined,
  });
  let lastObserved = "";
  let lastPublished = "";
  let changedAt = 0;
  let nextAttemptAt = 0;
  let retryMs = 30000;
  let stopping = false;
  process.once("SIGTERM", () => {
    stopping = true;
  });
  process.once("SIGINT", () => {
    stopping = true;
  });
  try {
    while (!stopping) {
      try {
        // Read-only polling detects changes made through every write path,
        // including unpublishing and deleting the final public event.
        const { rows } = await pool.query<{ fingerprint: string }>(
          `SELECT md5(jsonb_build_object(
          'events', (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "Event" e WHERE e."isPublic" AND e."teamId" = ANY($1::text[])),
          'types', (SELECT jsonb_agg(jsonb_build_object('id', et.id, 'name', et.name) ORDER BY et.id) FROM "EventType" et WHERE et."teamId" = ANY($1::text[])),
          'teams', (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'email', t.email, 'website', t.website) ORDER BY t.id) FROM "Teams" t WHERE t.id = ANY($1::text[])),
          'day', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'))::text) AS fingerprint`,
          [config.teamIds],
        );
        const fingerprint = rows[0].fingerprint;
        if (fingerprint !== lastObserved) {
          lastObserved = fingerprint;
          changedAt = Date.now();
        }
        if (
          fingerprint !== lastPublished &&
          Date.now() - changedAt >= 30000 &&
          Date.now() >= nextAttemptAt
        ) {
          await publishEvents(true);
          lastPublished = fingerprint;
          retryMs = 30000;
          console.log("Public event publication current.");
        }
      } catch {
        console.error(
          "Public event publication failed; previous deployment retained. Check publisher configuration and connectivity.",
        );
        nextAttemptAt = Date.now() + retryMs;
        retryMs = Math.min(retryMs * 2, 15 * 60000);
      }
      await new Promise((done) => setTimeout(done, 5000));
    }
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("Publisher stopped unexpectedly.");
  process.exitCode = 1;
});
