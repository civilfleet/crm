import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { PoolClient } from "pg";
import { buildFeed } from "../src/lib/public-data/build";
import {
  createPublicDataPool,
  dataDirectory,
  loadPublishedCache,
  producerVersion,
} from "../src/lib/public-data/runtime";
import { closeSearch, indexPublicEvents } from "../src/lib/public-data/search";
import { readPublicData } from "../src/lib/public-data/source";

export async function exportEvents(options: {
  client: PoolClient;
  teamIds?: string[] | null;
  reconcile?: boolean;
  registrationApi?: string;
}) {
  const previous = await loadPublishedCache();
  const producer = await producerVersion();
  const full =
    !previous ||
    previous.state.producer !== producer ||
    options.teamIds == null ||
    Boolean(options.reconcile);
  const run = randomUUID(),
    runDirectory = resolve(dataDirectory(), "runs", run),
    output = resolve(runDirectory, "out");
  await mkdir(output, { recursive: true });
  try {
    const snapshot = await readPublicData(
      options.client,
      full ? null : (options.teamIds ?? []),
      full || Boolean(options.reconcile),
    );
    const state = await buildFeed({
      snapshot,
      output,
      producer,
      indexer: indexPublicEvents,
      previous: previous?.state,
      previousOutput: previous?.output,
      registrationApi: options.registrationApi ?? "https://api.sea.watch",
    });
    return { run, runDirectory, output, state, previous };
  } catch (error) {
    await rm(runDirectory, { recursive: true, force: true });
    throw error;
  } finally {
    await closeSearch();
  }
}

if (process.argv[1]?.endsWith("export-public-events.ts")) {
  const pool = createPublicDataPool();
  void (async () => {
    const config = JSON.parse(
      await readFile("config/public-events.json", "utf8"),
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await exportEvents({
        client,
        registrationApi: config.registrationApi,
      });
      await client.query("COMMIT");
      console.log(
        JSON.stringify({
          directory: result.output,
          version: result.state.version,
          teams: Object.keys(result.state.teams).length,
        }),
      );
    } finally {
      client.release();
      await pool.end();
    }
  })().catch(() => {
    console.error("Public data export failed; existing publication retained.");
    process.exitCode = 1;
  });
}
