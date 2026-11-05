import { createHash } from "node:crypto";
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolConfig } from "pg";
import { type FeedState, SCHEMA_VERSION } from "./types";

export const dataDirectory = () =>
  resolve(process.env.PUBLIC_DATA_STATE_DIR ?? ".public-data");
export async function producerVersion() {
  const hash = createHash("sha256");
  for (const file of [
    ...(await readdir("src/lib/public-data"))
      .filter((f) => f.endsWith(".ts"))
      .sort()
      .map((f) => `src/lib/public-data/${f}`),
    "scripts/export-public-events.ts",
    "scripts/publish-public-events.ts",
    "yarn.lock",
  ])
    hash.update(await readFile(file));
  return hash.digest("hex").slice(0, 24);
}
export async function loadPublishedCache() {
  try {
    const pointer = JSON.parse(
      await readFile(resolve(dataDirectory(), "current.json"), "utf8"),
    ) as { run: string };
    if (!/^[a-zA-Z0-9-]+$/.test(pointer.run))
      throw new Error("Invalid cache pointer");
    const run = resolve(dataDirectory(), "runs", pointer.run);
    const state = JSON.parse(
      await readFile(resolve(run, "state.json"), "utf8"),
    ) as FeedState;
    if (state.schemaVersion !== SCHEMA_VERSION || !state.files["manifest.json"])
      return undefined;
    if (
      !state.teams ||
      !state.referenceFiles ||
      typeof state.producer !== "string" ||
      typeof state.version !== "string"
    )
      return undefined;
    for (const [id, team] of Object.entries(state.teams)) {
      if (
        team.profile?.id !== id ||
        !team.events ||
        !team.scopes ||
        !team.files
      )
        return undefined;
      for (const [path, hash] of Object.entries(team.files))
        if (state.files[path] !== hash) return undefined;
      for (const scope of Object.values(team.scopes)) {
        if (!scope.files || typeof scope.hash !== "string") return undefined;
        for (const [path, hash] of Object.entries(scope.files))
          if (state.files[path] !== hash) return undefined;
      }
    }
    const output = resolve(run, "out");
    for (const file of Object.keys(state.files)) {
      const path = resolve(output, file);
      if (!path.startsWith(`${output}/`) || !(await stat(path)).isFile())
        return undefined;
    }
    return { state, output, run };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      !["ENOENT", "ENOTDIR"].includes(String(error.code))
    )
      throw error;
    return undefined;
  }
}
export async function promotePublishedCache(run: string) {
  const temporary = resolve(dataDirectory(), `pointer-${run}.json`);
  await writeFile(temporary, JSON.stringify({ run }));
  await rename(temporary, resolve(dataDirectory(), "current.json"));
}
export function databaseOptions() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return {
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10000,
    ssl: process.env.PG_SSL_ROOT_CERT
      ? {
          ca: process.env.PG_SSL_ROOT_CERT.replace(/\\n/g, "\n"),
          rejectUnauthorized: true,
        }
      : undefined,
  };
}

// pg removes a failed idle client before emitting this event. Handling it keeps
// the worker alive; the next checkout creates a replacement connection.
export function createPublicDataPool(options: PoolConfig = databaseOptions()) {
  const pool = new Pool(options);
  pool.on("error", (error: Error & { code?: string }) => {
    const code =
      error.code && /^[A-Z0-9_]{1,64}$/.test(error.code)
        ? error.code
        : "UNKNOWN";
    console.error(
      "Public data idle database connection failed; a replacement will be opened on the next check.",
      code,
    );
  });
  return pool;
}
