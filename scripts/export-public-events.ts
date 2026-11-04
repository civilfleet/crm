import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { geohash, geohashBounds } from "../src/lib/public-events/geo";
import {
  isPast,
  normalizePostal,
  postalShard,
  type PublicSnapshot,
  type PublicEvent,
  type GeoShard,
  type GeoPoint,
  type EventManifest,
} from "../src/lib/public-events/types";

const root = resolve("public-events");
async function json(path: string, value: unknown) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

export async function exportEvents() {
  const settings = JSON.parse(
    await readFile("config/public-events.json", "utf8"),
  ) as { teamIds: string[] };
  if (!settings.teamIds.length)
    throw new Error("Explicit public event team allowlist required.");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10000,
    ssl: process.env.PG_SSL_ROOT_CERT
      ? {
          ca: process.env.PG_SSL_ROOT_CERT.replace(/\\n/g, "\n"),
          rejectUnauthorized: true,
        }
      : undefined,
  });
  try {
    await pool.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    // Raw projection remains compatible before the additive country migration.
    const { rows } = await pool.query(
      `SELECT e."id", e."teamId", COALESCE(NULLIF(e."slug", ''), e."id") AS slug,
      e."title", COALESCE(e."description", '') AS description, COALESCE(e."location", '') AS location,
      COALESCE(e."city", '') AS city, COALESCE(e."state", '') AS state, COALESCE(e."postalCode", '') AS "postalCode",
      to_jsonb(e)->>'countryCode' AS "countryCode", e."isOnline", e."startDate", e."endDate",
      COALESCE(NULLIF(e."timeZone", ''), 'Europe/Berlin') AS "timeZone", COALESCE(et.name, '') AS "eventType"
      FROM "Event" e LEFT JOIN "EventType" et ON et.id = e."eventTypeId" WHERE e."isPublic" = true AND e."teamId" = ANY($1::text[]) ORDER BY e."startDate", e.id`,
      [settings.teamIds],
    );
    const teams = await pool.query(
      `SELECT id, name, email, website FROM "Teams" WHERE id = ANY($1::text[]) ORDER BY name`,
      [settings.teamIds],
    );
    const allCountries = await pool.query<{ countryCode: string }>(
      `SELECT DISTINCT "countryCode" FROM "PostalCodeCentroid" WHERE latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY "countryCode"`,
    );
    const coordinates = new Map<
      string,
      { countryCode: string; latitude: number; longitude: number }[]
    >();
    const eventPostals = new Set(
      rows.map((event) => normalizePostal(event.postalCode)),
    );
    const postalFiles = new Map<string, Record<string, [number, number]>>();
    const postalHash = createHash("sha256");
    for (const { countryCode } of allCountries.rows) {
      const { rows: centroids } = await pool.query<{
        postalCode: string;
        latitude: string;
        longitude: string;
      }>(
        `SELECT "postalCode", latitude, longitude FROM "PostalCodeCentroid" WHERE "countryCode" = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY "postalCode"`,
        [countryCode],
      );
      postalHash.update(countryCode).update(JSON.stringify(centroids));
      for (const item of centroids) {
        const postal = normalizePostal(item.postalCode);
        const latitude = Number(item.latitude);
        const longitude = Number(item.longitude);
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 ||
          Math.abs(longitude) > 180
        )
          continue;
        const path = postalShard(countryCode, postal);
        const shard = postalFiles.get(path) ?? {};
        shard[postal] = [latitude, longitude];
        postalFiles.set(path, shard);
        if (eventPostals.has(postal)) {
          const found = coordinates.get(postal) ?? [];
          found.push({ countryCode, latitude, longitude });
          coordinates.set(postal, found);
        }
      }
    }
    await pool.query("COMMIT");
    const events: PublicEvent[] = rows.map((row) => {
      const candidates = coordinates.get(normalizePostal(row.postalCode)) ?? [];
      const match = row.countryCode
        ? candidates.find((item) => item.countryCode === row.countryCode)
        : candidates.length === 1
          ? candidates[0]
          : undefined;
      return {
        ...row,
        countryCode: row.countryCode ?? match?.countryCode ?? null,
        latitude: match?.latitude ?? null,
        longitude: match?.longitude ?? null,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate?.toISOString() ?? null,
      };
    });
    const generatedAt = new Date().toISOString();
    // Keep all assets in one immutable generation. Date rollover is part of the
    // fingerprint, so daily refreshes move ended events into the archive.
    const sourceHash = createHash("sha256");
    async function hashSources(directory: string) {
      for (const entry of (
        await readdir(directory, { withFileTypes: true })
      ).sort((a, b) => a.name.localeCompare(b.name))) {
        if (
          [".next", "out", ".snapshot.json", "next-env.d.ts", "data"].includes(
            entry.name,
          )
        )
          continue;
        const file = resolve(directory, entry.name);
        if (entry.isDirectory()) await hashSources(file);
        else if (entry.isFile())
          sourceHash
            .update(file.slice(process.cwd().length))
            .update(await readFile(file));
      }
    }
    await hashSources(root);
    for (const file of [
      "yarn.lock",
      "scripts/export-public-events.ts",
      "src/lib/public-events/types.ts",
      "src/lib/public-events/geo.ts",
    ])
      sourceHash.update(await readFile(file));
    const fingerprint = JSON.stringify({
      source: sourceHash.digest("hex"),
      postal: postalHash.digest("hex"),
      teams: teams.rows,
      events,
      day: generatedAt.slice(0, 10),
      registration: process.env.NEXT_PUBLIC_EVENTS_API_URL ?? "",
    });
    const version = createHash("sha256")
      .update(fingerprint)
      .digest("hex")
      .slice(0, 20);
    const data: PublicSnapshot = {
      version,
      generatedAt,
      teams: teams.rows,
      events,
    };
    for (const event of events) {
      if (
        !/^[a-zA-Z0-9_-]+$/.test(event.teamId) ||
        !/^[a-zA-Z0-9_-]+$/.test(event.slug)
      )
        throw new Error(`Unsafe public route for event ${event.id}`);
      new Intl.DateTimeFormat("en", { timeZone: event.timeZone });
    }
    // Only remove generated data; keep source-controlled public assets.
    await rm(resolve(root, "public/data"), { recursive: true, force: true });
    const base = resolve(root, "public/data", version);
    const geo: GeoShard[] = [];
    async function shard(
      points: GeoPoint[],
      hash: string,
      teamId: string,
      scope: string,
    ): Promise<void> {
      if (points.length > 256 && hash.length < 8) {
        const children = Map.groupBy(points, (p) =>
          geohash(p.latitude, p.longitude, hash.length + 1),
        );
        for (const [child, values] of children)
          await shard(values, child, teamId, scope);
        return;
      }
      const path = `/data/${version}/geo/${teamId}/${scope}/${hash}.json`;
      geo.push({ path, teamId, scope, bounds: geohashBounds(hash) });
      await json(resolve(root, "public", path.slice(1)), points);
    }
    for (const team of data.teams) {
      const items = events.filter((event) => event.teamId === team.id);
      const years = [
        ...new Set(
          items
            .filter((e) => isPast(e, Date.parse(generatedAt)))
            .map((e) => e.startDate.slice(0, 4)),
        ),
      ]
        .sort()
        .reverse();
      const pages: Record<string, number> = {};
      const counts: Record<string, number> = {};
      const geoIndexes: Record<string, string> = {};
      for (const scope of ["upcoming", ...years]) {
        const list = items
          .filter((e) =>
            scope === "upcoming"
              ? !isPast(e, Date.parse(generatedAt))
              : isPast(e, Date.parse(generatedAt)) &&
                e.startDate.startsWith(scope),
          )
          .sort((a, b) =>
            scope === "upcoming"
              ? a.startDate.localeCompare(b.startDate)
              : b.startDate.localeCompare(a.startDate),
          );
        pages[scope] = Math.ceil(list.length / 12);
        counts[scope] = list.length;
        for (let page = 0; page < Math.max(1, pages[scope]); page++) {
          await json(
            resolve(base, team.id, scope, `${page + 1}.json`),
            list
              .slice(page * 12, page * 12 + 12)
              .map(
                ({
                  description,
                  latitude: _lat,
                  longitude: _lon,
                  ...summary
                }) => ({ ...summary, excerpt: description.slice(0, 180) }),
              ),
          );
        }
        const located = list
          .filter((e) => e.latitude !== null && e.longitude !== null)
          .map((e) => ({
            id: e.id,
            latitude: e.latitude as number,
            longitude: e.longitude as number,
          }));
        for (const [hash, points] of Map.groupBy(located, (p) =>
          geohash(p.latitude, p.longitude),
        ))
          await shard(points, hash, team.id, scope);
        const prefixIndexes: GeoShard[] = [];
        const leaves = geo.filter(
          (g) => g.teamId === team.id && g.scope === scope,
        );
        for (const [prefix, entries] of Map.groupBy(leaves, (g) =>
          g.path.slice(
            g.path.lastIndexOf("/") + 1,
            g.path.lastIndexOf("/") + 3,
          ),
        )) {
          const path = `/data/${version}/geo/${team.id}/${scope}/index-${prefix}.json`;
          await json(resolve(root, "public", path.slice(1)), entries);
          prefixIndexes.push({
            path,
            teamId: team.id,
            scope,
            bounds: geohashBounds(prefix),
          });
        }
        const path = `/data/${version}/geo/${team.id}/${scope}/index.json`;
        await json(resolve(root, "public", path.slice(1)), prefixIndexes);
        geoIndexes[scope] = path;
      }
      const unique = (values: string[]) =>
        [...new Set(values.filter(Boolean))].sort();
      const manifest: EventManifest = {
        version,
        generatedAt,
        years,
        dates: unique(items.map((e) => e.startDate.slice(0, 10))),
        types: unique(items.map((e) => e.eventType)),
        states: unique(items.map((e) => e.state)),
        countries: allCountries.rows.map((c) => c.countryCode),
        pages,
        counts,
        geoIndexes,
      };
      await json(resolve(base, team.id, "manifest.json"), manifest);
    }
    for (const [path, values] of postalFiles)
      await json(resolve(base, "postal", path), values);
    await json(resolve(root, ".snapshot.json"), data);
    console.log(
      `Exported ${events.length} public events, ${data.teams.length} teams; version ${version}.`,
    );
    const unresolved = events.filter(
      (e) => !e.isOnline && e.postalCode && e.latitude === null,
    );
    if (unresolved.length)
      console.warn(
        `${unresolved.length} event locations need country/centroid correction; excluded from radius searches.`,
      );
    return data;
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("export-public-events.ts")) {
  exportEvents().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Export failed");
    process.exitCode = 1;
  });
}
