import { createHash } from "node:crypto";
import { link, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { geohash, geohashBounds } from "../public-events/geo";
import {
  type GeoPoint,
  isPast,
  type PublicEvent,
  type PublicTeam,
} from "../public-events/types";
import {
  type Digests,
  type FeedManifest,
  type FeedState,
  PAGE_SIZE,
  SCHEMA_VERSION,
  type ScopeManifest,
  type ScopeState,
  type SearchIndexer,
  type SourceSnapshot,
  type TeamManifest,
  type TeamState,
} from "./types";

export const contentHash = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 24);
const safeId = (id: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Unsafe public identifier");
  return id;
};
const cleanTeam = (t: PublicTeam): PublicTeam => ({
  id: safeId(t.id),
  name: t.name,
  email: t.email,
  website: t.website,
});
export function cleanEvent(e: PublicEvent): PublicEvent {
  return {
    id: safeId(e.id),
    teamId: safeId(e.teamId),
    slug: e.slug,
    title: e.title,
    description: e.description,
    location: e.location,
    city: e.city,
    state: e.state,
    postalCode: e.postalCode,
    countryCode: e.countryCode,
    isOnline: e.isOnline,
    startDate: e.startDate,
    endDate: e.endDate,
    timeZone: e.timeZone,
    eventType: e.eventType,
    latitude: e.latitude,
    longitude: e.longitude,
  };
}
export const eventScope = (event: PublicEvent, now: number) =>
  isPast(event, now) ? `archive/${event.startDate.slice(0, 4)}` : "upcoming";

class Output {
  files: Digests = {};
  constructor(
    readonly root: string,
    readonly previousRoot?: string,
    readonly previousFiles: Digests = {},
  ) {}
  async reuse(files: Digests, owner?: Digests) {
    if (!this.previousRoot && Object.keys(files).length)
      throw new Error("Missing publication cache");
    for (const [path, hash] of Object.entries(files)) {
      if (!(path in this.files)) {
        const destination = this.path(path);
        await mkdir(dirname(destination), { recursive: true });
        await link(resolve(this.previousRoot ?? "", path), destination);
      }
      this.files[path] = hash;
      if (owner) owner[path] = hash;
    }
  }
  path(path: string) {
    const result = resolve(this.root, path);
    if (!result.startsWith(`${resolve(this.root)}/`))
      throw new Error("Unsafe asset path");
    return result;
  }
  async bytes(path: string, value: Uint8Array | string, owner?: Digests) {
    const digest = createHash("sha1").update(value).digest("hex");
    if (this.previousFiles[path] === digest && this.previousRoot)
      await this.reuse({ [path]: digest }, owner);
    else {
      const destination = this.path(path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, value);
      this.files[path] = digest;
      if (owner) owner[path] = digest;
    }
    return `/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
  json(path: string, value: unknown, owner?: Digests) {
    return this.bytes(path, JSON.stringify(value), owner);
  }
}

type GeoEntry = {
  path: string;
  bounds: [number, number, number, number];
  pages: number;
  count: number;
};
async function buildGeo(
  out: Output,
  base: string,
  events: PublicEvent[],
  files: Digests,
) {
  const points = events.flatMap((e) =>
    e.latitude !== null && e.longitude !== null
      ? [{ id: e.id, latitude: e.latitude, longitude: e.longitude }]
      : [],
  );
  const groups = new Map<string, GeoPoint[]>();
  const entries: GeoEntry[] = [];
  async function split(items: GeoPoint[], hash: string): Promise<void> {
    if (items.length > 256 && hash.length < 8) {
      const children = new Map<string, GeoPoint[]>();
      for (const p of items) {
        const key = geohash(p.latitude, p.longitude, hash.length + 1);
        if (!children.has(key)) children.set(key, []);
        children.get(key)?.push(p);
      }
      for (const [key, values] of children) await split(values, key);
      return;
    }
    const pages = Math.ceil(items.length / 256);
    for (let i = 0; i < pages; i++)
      await out.json(
        `${base}/${hash}/${i + 1}.json`,
        items.slice(i * 256, (i + 1) * 256),
        files,
      );
    entries.push({
      path: `/${base}/${hash}/`,
      bounds: geohashBounds(hash),
      pages,
      count: items.length,
    });
  }
  for (const point of points) {
    const key = geohash(point.latitude, point.longitude, 2);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(point);
  }
  for (const [key, values] of groups) await split(values, key);
  const prefixes = [];
  for (const key of groups.keys()) {
    const leaves = entries.filter((e) => e.path.startsWith(`/${base}/${key}`));
    const pages = Math.ceil(leaves.length / 128);
    for (let i = 0; i < pages; i++)
      await out.json(
        `${base}/index-${key}-${i + 1}.json`,
        leaves.slice(i * 128, (i + 1) * 128),
        files,
      );
    prefixes.push({
      pathTemplate: `/${base}/index-${key}-{page}.json`,
      pages,
      bounds: geohashBounds(key),
    });
  }
  return out.json(
    `${base}/index.json`,
    { schemaVersion: SCHEMA_VERSION, prefixes },
    files,
  );
}

export async function buildFeed(options: {
  snapshot: SourceSnapshot;
  output: string;
  producer: string;
  registrationApi: string;
  previous?: FeedState;
  previousOutput?: string;
  now?: Date;
  indexer: SearchIndexer;
}) {
  const { snapshot, previous, producer, indexer } = options;
  const now = options.now ?? new Date();
  const out = new Output(
    options.output,
    options.previousOutput,
    previous?.files,
  );
  const teams: Record<string, TeamState> = {};
  if (!snapshot.complete && previous) {
    for (const [id, state] of Object.entries(previous.teams))
      if (!snapshot.teamIds.includes(id)) {
        teams[id] = state;
        await out.reuse(state.files);
      }
  }
  let referenceFiles: Digests = {},
    postalManifest = previous?.postalManifest ?? null;
  if (snapshot.postal) {
    const hash = contentHash({
      schemaVersion: SCHEMA_VERSION,
      postal: snapshot.postal,
    });
    const countries: Record<string, Record<string, string>> = {};
    for (const [key, value] of Object.entries(snapshot.postal)) {
      if (!/^[A-Z]{2}\/[A-Za-z0-9%_-]+\.json$/.test(key))
        throw new Error("Unsafe postal shard");
      const country = key.slice(0, 2);
      countries[country] ??= {};
      countries[country][key.slice(3, -5)] = await out.json(
        `reference/postal/${hash}/${key}`,
        value,
        referenceFiles,
      );
    }
    const links: Record<string, string> = {};
    for (const [country, shards] of Object.entries(countries))
      links[country] = await out.json(
        `reference/postal/${hash}/${country}/manifest.json`,
        { schemaVersion: SCHEMA_VERSION, country, shards },
        referenceFiles,
      );
    postalManifest = await out.json(
      `reference/postal/${hash}/manifest.json`,
      { schemaVersion: SCHEMA_VERSION, countries: links },
      referenceFiles,
    );
  } else if (previous) {
    referenceFiles = previous.referenceFiles;
    await out.reuse(referenceFiles);
  }
  for (const input of snapshot.teams) {
    if (!input.events.length) continue;
    const profile = cleanTeam(input.team);
    const id = profile.id,
      files: Digests = {},
      descriptors: TeamState["events"] = {};
    const events = input.events
      .map(cleanEvent)
      .sort((a, b) => a.id.localeCompare(b.id));
    const scopes = new Map<string, PublicEvent[]>([["upcoming", []]]);
    for (const event of events) {
      if (event.teamId !== id) throw new Error("Cross-team event in export");
      const hash = contentHash({ schemaVersion: SCHEMA_VERSION, event }),
        scope = eventScope(event, now.getTime());
      const path = await out.json(
        `teams/${id}/data/events/${event.id}/${hash}.json`,
        { schemaVersion: SCHEMA_VERSION, event },
        files,
      );
      descriptors[event.id] = { hash, path, scope };
      if (!scopes.has(scope)) scopes.set(scope, []);
      scopes.get(scope)?.push(event);
    }
    const builtScopes: Record<string, ScopeState> = {};
    for (const [scope, items] of [...scopes].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      items.sort(
        (a, b) =>
          (scope === "upcoming"
            ? a.startDate.localeCompare(b.startDate)
            : b.startDate.localeCompare(a.startDate)) ||
          a.id.localeCompare(b.id),
      );
      const hash = contentHash({
        producer,
        scope,
        records: items.map((e) => descriptors[e.id].hash),
      });
      const prior = previous?.teams[id]?.scopes[scope];
      if (prior?.hash === hash) {
        builtScopes[scope] = prior;
        await out.reuse(prior.files, files);
        continue;
      }
      const scopeFiles: Digests = {},
        base = `teams/${id}/data/listings/${scope}/${hash}`;
      const pages = Math.ceil(items.length / PAGE_SIZE);
      for (let page = 0; page < pages; page++) {
        const summaries = items
          .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
          .map((event) => {
            const {
              description,
              latitude: _lat,
              longitude: _lon,
              ...summary
            } = event;
            return {
              ...summary,
              excerpt: description.slice(0, 180),
              detailUrl: descriptors[event.id].path,
            };
          });
        await out.json(
          `${base}/${page + 1}.json`,
          {
            schemaVersion: SCHEMA_VERSION,
            teamId: id,
            scope,
            version: hash,
            page: page + 1,
            pageSize: PAGE_SIZE,
            total: items.length,
            items: summaries,
          },
          scopeFiles,
        );
      }
      let search: string | null = null;
      if (items.length) {
        const assets = await indexer(
          items.map((event) => ({ event, detail: descriptors[event.id].path })),
        );
        if (!assets.some((a) => a.path === "pagefind.js"))
          throw new Error("Incomplete search index");
        for (const asset of assets)
          await out.bytes(
            `${base}/search/${asset.path}`,
            asset.content,
            scopeFiles,
          );
        search = `/${base}/search/pagefind.js`;
      }
      const geo = await buildGeo(out, `${base}/geo`, items, scopeFiles);
      const unique = (values: (string | null)[]) =>
        [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
      const manifest = await out.json(
        `${base}/manifest.json`,
        {
          schemaVersion: SCHEMA_VERSION,
          teamId: id,
          scope,
          version: hash,
          count: items.length,
          pages,
          pageSize: PAGE_SIZE,
          pageUrlTemplate: `/${base}/{page}.json`,
          search: search
            ? { engine: "pagefind", language: "en", moduleUrl: search }
            : null,
          geo,
          filters: {
            types: unique(items.map((e) => e.eventType)),
            states: unique(items.map((e) => e.state)),
            countries: unique(items.map((e) => e.countryCode)),
          },
        },
        scopeFiles,
      );
      Object.assign(files, scopeFiles);
      builtScopes[scope] = {
        hash,
        manifest,
        count: items.length,
        files: scopeFiles,
      };
    }
    const teamVersion = contentHash({
      profile,
      events: descriptors,
      scopes: Object.fromEntries(
        Object.entries(builtScopes).map(([key, value]) => [key, value.hash]),
      ),
    });
    const metadata = await out.json(
      `teams/${id}/data/profile/${contentHash({ schemaVersion: SCHEMA_VERSION, profile })}.json`,
      { schemaVersion: SCHEMA_VERSION, team: profile },
      files,
    );
    await out.json(
      `teams/${id}/manifest.json`,
      {
        schemaVersion: SCHEMA_VERSION,
        teamId: id,
        version: teamVersion,
        team: metadata,
        scopes: Object.fromEntries(
          Object.entries(builtScopes).map(([key, value]) => [
            key,
            { manifest: value.manifest, count: value.count },
          ]),
        ),
      },
      files,
    );
    teams[id] = { profile, events: descriptors, scopes: builtScopes, files };
  }
  const entries = Object.values(teams)
    .map((t) => ({
      id: t.profile.id,
      name: t.profile.name,
      manifest: `/teams/${t.profile.id}/manifest.json`,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const directoryHash = contentHash(entries),
    directoryPages = Math.ceil(entries.length / 50);
  for (let i = 0; i < directoryPages; i++)
    await out.json(`teams/index/${directoryHash}/${i + 1}.json`, {
      page: i + 1,
      total: entries.length,
      items: entries.slice(i * 50, (i + 1) * 50),
    });
  const version = contentHash({
    producer,
    files: Object.entries(out.files).sort(([a], [b]) => a.localeCompare(b)),
    registrationApi: options.registrationApi,
    postalManifest,
  });
  const generatedAt =
    previous?.version === version ? previous.generatedAt : now.toISOString();
  await out.json("manifest.json", {
    schemaVersion: SCHEMA_VERSION,
    version,
    generatedAt,
    registrationApi: options.registrationApi,
    teams: {
      count: entries.length,
      pages: directoryPages,
      pageSize: 50,
      pageUrlTemplate: `/teams/index/${directoryHash}/{page}.json`,
    },
    postal: postalManifest,
  });
  await out.bytes(
    "_headers",
    `/*\n  Access-Control-Allow-Origin: *\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex\n/manifest.json\n  Cache-Control: public, max-age=0, must-revalidate\n/teams/:teamId/manifest.json\n  Cache-Control: public, max-age=0, must-revalidate\n/teams/:teamId/data/*\n  Cache-Control: public, max-age=31536000, immutable\n/teams/index/*\n  Cache-Control: public, max-age=31536000, immutable\n/reference/*\n  Cache-Control: public, max-age=31536000, immutable\n`,
  );
  const state: FeedState = {
    schemaVersion: SCHEMA_VERSION,
    producer,
    version,
    generatedAt,
    teams,
    referenceFiles,
    postalManifest,
    files: out.files,
  };
  await writeFile(
    resolve(options.output, "../state.json"),
    JSON.stringify(state),
  );
  return state;
}

export async function validateFeed(directory: string, files: Digests) {
  if (!files["manifest.json"] || !files._headers)
    throw new Error("Incomplete public data export");
  const root = resolve(directory);
  const requireAsset = (url: string) => {
    if (!url.startsWith("/") || !(decodeURIComponent(url.slice(1)) in files))
      throw new Error("Unresolved public data reference");
  };
  async function json<T>(url: string): Promise<T> {
    requireAsset(url);
    return JSON.parse(
      await readFile(resolve(root, decodeURIComponent(url.slice(1))), "utf8"),
    ) as T;
  }
  const manifest = await json<FeedManifest>("/manifest.json");
  if (manifest.schemaVersion !== SCHEMA_VERSION || !manifest.version)
    throw new Error("Unsupported public data manifest");
  for (const path of Object.keys(files)) {
    const absolute = resolve(root, path);
    if (
      !absolute.startsWith(`${root}/`) ||
      /\.html$/i.test(path) ||
      !(await stat(absolute)).isFile()
    )
      throw new Error("Invalid public data artifact");
    if (/^teams\/[^/]+\/manifest\.json$/.test(path)) {
      const team = await json<TeamManifest>(`/${path}`);
      requireAsset(team.team);
      for (const entry of Object.values(team.scopes)) {
        const scope = await json<ScopeManifest>(entry.manifest);
        requireAsset(scope.geo);
        if (scope.search) requireAsset(scope.search.moduleUrl);
        for (let page = 1; page <= scope.pages; page++)
          requireAsset(scope.pageUrlTemplate.replace("{page}", String(page)));
      }
    }
  }
  for (let page = 1; page <= manifest.teams.pages; page++)
    requireAsset(
      manifest.teams.pageUrlTemplate.replace("{page}", String(page)),
    );
  if (manifest.postal) requireAsset(manifest.postal);
}
