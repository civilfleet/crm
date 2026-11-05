import type { PoolClient } from "pg";
import {
  normalizePostal,
  type PublicEvent,
  type PublicTeam,
  postalShard,
} from "../public-events/types";
import type { SourceSnapshot } from "./types";

type EventRow = Omit<
  PublicEvent,
  "startDate" | "endDate" | "latitude" | "longitude"
> & {
  startDate: Date;
  endDate: Date | null;
};

// The caller holds a REPEATABLE READ, READ ONLY transaction. Never SELECT * here.
export async function readPublicData(
  client: PoolClient,
  teamIds: string[] | null,
  includePostal: boolean,
): Promise<SourceSnapshot> {
  const { rows: teams } = await client.query<PublicTeam>(
    `SELECT t.id, t.name, t.email, t.website FROM "Teams" t
     WHERE ($1::text[] IS NULL OR t.id = ANY($1))
       AND EXISTS (SELECT 1 FROM "Event" e WHERE e."teamId" = t.id AND e."isPublic")
     ORDER BY t.id`,
    [teamIds],
  );
  const { rows } = await client.query<EventRow>(
    `SELECT e.id, e."teamId", COALESCE(NULLIF(e.slug, ''), e.id) AS slug,
       e.title, COALESCE(e.description, '') AS description,
       COALESCE(e.location, '') AS location, COALESCE(e.city, '') AS city,
       COALESCE(e.state, '') AS state, COALESCE(e."postalCode", '') AS "postalCode",
       e."countryCode", e."isOnline", e."startDate", e."endDate",
       COALESCE(NULLIF(e."timeZone", ''), 'Europe/Berlin') AS "timeZone",
       COALESCE(et.name, '') AS "eventType"
     FROM "Event" e LEFT JOIN "EventType" et ON et.id = e."eventTypeId"
     WHERE e."isPublic" AND ($1::text[] IS NULL OR e."teamId" = ANY($1))
     ORDER BY e.id`,
    [teamIds],
  );
  const postalCodes = [
    ...new Set(rows.map((e) => normalizePostal(e.postalCode))),
  ];
  const { rows: centroids } = await client.query<{
    countryCode: string;
    postalCode: string;
    latitude: string;
    longitude: string;
  }>(
    `SELECT "countryCode", "postalCode", latitude, longitude FROM "PostalCodeCentroid"
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND ($1::boolean OR "postalCode" = ANY($2::text[]))
      ORDER BY "countryCode", "postalCode"`,
    [includePostal, postalCodes],
  );
  const positions = new Map<
    string,
    { country: string; lat: number; lon: number }[]
  >();
  const postal: NonNullable<SourceSnapshot["postal"]> = {};
  for (const row of centroids) {
    const lat = Number(row.latitude),
      lon = Number(row.longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      continue;
    const code = normalizePostal(row.postalCode);
    const country = row.countryCode.trim().toUpperCase();
    const candidates = positions.get(code) ?? [];
    candidates.push({ country, lat, lon });
    positions.set(code, candidates);
    if (includePostal) {
      const key = postalShard(country, code);
      postal[key] ??= {};
      postal[key][code] = [lat, lon];
    }
  }
  const events = rows.map((row) => {
    const country = row.countryCode?.trim().toUpperCase();
    const candidates = positions.get(normalizePostal(row.postalCode)) ?? [];
    const point = country
      ? candidates.find((p) => p.country === country)
      : candidates.length === 1
        ? candidates[0]
        : undefined;
    new Intl.DateTimeFormat("en", { timeZone: row.timeZone });
    return {
      ...row,
      countryCode: country ?? point?.country ?? null,
      latitude: point?.lat ?? null,
      longitude: point?.lon ?? null,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate?.toISOString() ?? null,
    };
  });
  return {
    complete: teamIds === null,
    teamIds: teamIds ?? teams.map((t) => t.id),
    teams: teams.map((team) => ({
      team,
      events: events.filter((e) => e.teamId === team.id),
    })),
    ...(includePostal ? { postal } : {}),
  };
}
