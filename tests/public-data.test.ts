import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildFeed,
  cleanEvent,
  validateFeed,
} from "../src/lib/public-data/build";
import type {
  EventLookupManifest,
  FeedState,
  SearchIndexer,
  SourceSnapshot,
  TeamManifest,
  TeamSnapshot,
} from "../src/lib/public-data/types";
import type { PublicEvent } from "../src/lib/public-events/types";

const now = new Date("2026-11-05T12:00:00Z");
const event = (
  id: string,
  teamId: string,
  startDate = "2026-12-01T12:00:00Z",
): PublicEvent => ({
  id,
  teamId,
  slug: id,
  title: id,
  description: "Public description",
  location: "Berlin",
  city: "Berlin",
  state: "Berlin",
  postalCode: "10115",
  countryCode: "DE",
  isOnline: false,
  startDate,
  endDate: null,
  timeZone: "Europe/Berlin",
  eventType: "Meetup",
  latitude: 52.52,
  longitude: 13.4,
});
const team = (id: string, events: PublicEvent[]): TeamSnapshot => ({
  team: { id, name: id, email: "public@example.org", website: null },
  events,
});
const snapshot = (
  teams: TeamSnapshot[],
  complete = true,
  teamIds = teams.map((t) => t.team.id),
): SourceSnapshot => ({ teams, complete, teamIds });

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "crm-public-data-"));
  let previous: FeedState | undefined,
    previousOutput: string | undefined,
    round = 0;
  const calls: string[] = [];
  const indexer: SearchIndexer = async (records) => {
    calls.push(records.map((r) => r.event.id).join(","));
    return [
      {
        path: "pagefind.js",
        content: new TextEncoder().encode(
          JSON.stringify(records.map((r) => r.detail)),
        ),
      },
    ];
  };
  return {
    root,
    calls,
    async build(source: SourceSnapshot, date = now) {
      const output = join(root, String(round++), "out");
      await mkdir(output, { recursive: true });
      const state = await buildFeed({
        snapshot: source,
        output,
        previous,
        previousOutput,
        now: date,
        producer: "test-producer",
        registrationApi: "https://api.example.org",
        indexer,
      });
      await validateFeed(output, state.files);
      previous = state;
      previousOutput = output;
      return { state, output };
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("one event edit preserves unrelated teams and archive scopes; obsolete detail is removed", async () => {
  const h = await harness();
  try {
    const a = event("a-upcoming", "team-a"),
      old = event("a-old", "team-a", "2025-01-01T12:00:00Z");
    const b = event("b-upcoming", "team-b");
    const first = await h.build(
      snapshot([team("team-a", [a, old]), team("team-b", [b])]),
    );
    h.calls.length = 0;
    const next = await h.build(
      snapshot(
        [team("team-a", [{ ...a, description: "Changed" }, old])],
        false,
      ),
    );
    assert.deepEqual(h.calls, ["a-upcoming"]);
    assert.deepEqual(next.state.teams["team-b"], first.state.teams["team-b"]);
    assert.deepEqual(
      next.state.teams["team-a"].scopes["archive/2025"],
      first.state.teams["team-a"].scopes["archive/2025"],
    );
    assert.equal(
      next.state.files[first.state.teams["team-a"].events[a.id].path.slice(1)],
      undefined,
    );
    for (const [path, digest] of Object.entries(
      first.state.teams["team-b"].files,
    )) {
      assert.equal(next.state.files[path], digest);
      assert.equal(
        (await stat(join(first.output, path))).ino,
        (await stat(join(next.output, path))).ino,
      );
    }
  } finally {
    await h.cleanup();
  }
});

test("archive moves, last public event removal, and empty datasets remove obsolete assets", async () => {
  const h = await harness();
  try {
    const e = event("test-event", "team-a", "2025-01-01T12:00:00Z");
    const first = await h.build(snapshot([team("team-a", [e])]));
    const next = await h.build(
      snapshot(
        [team("team-a", [{ ...e, startDate: "2026-01-01T12:00:00Z" }])],
        false,
      ),
    );
    assert.ok(!next.state.teams["team-a"].scopes["archive/2025"]);
    assert.ok(next.state.teams["team-a"].scopes["archive/2026"]);
    assert.ok(
      Object.keys(
        first.state.teams["team-a"].scopes["archive/2025"].files,
      ).every((p) => !(p in next.state.files)),
    );
    const empty = await h.build(snapshot([], false, ["team-a"]));
    assert.deepEqual(empty.state.teams, {});
    assert.ok(
      !Object.keys(empty.state.files).some((p) =>
        p.startsWith("teams/team-a/"),
      ),
    );
    const manifest = JSON.parse(
      await readFile(join(empty.output, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.teams.count, 0);
    assert.equal(manifest.teams.pages, 0);
  } finally {
    await h.cleanup();
  }
});

test("unchanged reconciliation is deterministic and rollover only changes affected scopes", async () => {
  const h = await harness();
  try {
    const source = snapshot([
      team("team-a", [event("soon", "team-a", "2026-11-05T13:00:00Z")]),
    ]);
    const first = await h.build(source);
    const same = await h.build(source);
    assert.equal(first.state.version, same.state.version);
    assert.deepEqual(first.state.files, same.state.files);
    const next = await h.build(source, new Date("2026-11-06T00:00:00Z"));
    assert.equal(next.state.teams["team-a"].scopes.upcoming.count, 0);
    assert.equal(next.state.teams["team-a"].scopes["archive/2026"].count, 1);
  } finally {
    await h.cleanup();
  }
});

test("public projection excludes injected private properties", () => {
  const output = cleanEvent({
    ...event("test", "team"),
    contactId: "private",
    registrations: ["private"],
  } as PublicEvent);
  assert.ok(!JSON.stringify(output).includes("private"));
});

test("10,000 historical events stay paginated, including identical geographic coordinates", async () => {
  const h = await harness();
  try {
    const events = Array.from({ length: 10000 }, (_, i) =>
      event(
        `event-${i.toString().padStart(5, "0")}`,
        "team",
        "2025-01-01T12:00:00Z",
      ),
    );
    const result = await h.build(snapshot([team("team", events)]));
    const scope = result.state.teams.team.scopes["archive/2025"];
    const manifest = JSON.parse(
      await readFile(join(result.output, scope.manifest.slice(1)), "utf8"),
    );
    assert.equal(manifest.pages, 834);
    const first = JSON.parse(
      await readFile(
        join(
          result.output,
          manifest.pageUrlTemplate.replace("{page}", "1").slice(1),
        ),
        "utf8",
      ),
    );
    assert.equal(first.items.length, 12);
    assert.ok(!("description" in first.items[0]));
    assert.ok((await stat(join(result.output, "manifest.json"))).size < 2048);
    assert.ok(
      (await stat(join(result.output, "teams/team/manifest.json"))).size < 4096,
    );
    const leaves = Object.keys(scope.files).filter((p) =>
      /\/geo\/[a-z0-9]+\/\d+\.json$/.test(p),
    );
    assert.equal(leaves.length, 40);
    for (const path of leaves)
      assert.ok(
        JSON.parse(await readFile(join(result.output, path), "utf8")).length <=
          256,
      );
  } finally {
    await h.cleanup();
  }
});

async function readJson<T>(output: string, path: string): Promise<T> {
  return JSON.parse(
    await readFile(join(output, path.replace(/^\//, "")), "utf8"),
  ) as T;
}

test("team discovery exposes stable UUID lookups whose targets follow edits and preserve incremental reuse", async () => {
  const h = await harness();
  const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const otherTeamId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const eventId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const anotherId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  try {
    const fixture = event(eventId, teamId);
    const first = await h.build(
      snapshot([
        team(teamId, [fixture, event(anotherId, teamId)]),
        team(otherTeamId, [event("other", otherTeamId)]),
      ]),
    );
    const manifest = await readJson<TeamManifest>(
      first.output,
      `/teams/${teamId}/manifest.json`,
    );
    assert.equal(
      manifest.eventLookupUrlTemplate,
      `/teams/${teamId}/events/{eventId}/manifest.json`,
    );
    const lookupPath = manifest.eventLookupUrlTemplate.replace(
      "{eventId}",
      eventId,
    );
    const pointer = await readJson<EventLookupManifest>(
      first.output,
      lookupPath,
    );
    assert.deepEqual(pointer, {
      schemaVersion: 1,
      teamId,
      eventId,
      detailUrl: first.state.teams[teamId].events[eventId].path,
    });
    const target = await readJson<{ event: PublicEvent }>(
      first.output,
      pointer.detailUrl,
    );
    assert.equal(target.event.id, eventId);
    assert.equal(target.event.teamId, teamId);
    await assert.rejects(
      readFile(
        join(
          first.output,
          `teams/${otherTeamId}/events/${eventId}/manifest.json`,
        ),
      ),
      { code: "ENOENT" },
    );
    const edited = await h.build(
      snapshot(
        [
          team(teamId, [
            { ...fixture, title: "Edited title", slug: "new-slug" },
            event(anotherId, teamId),
          ]),
        ],
        false,
      ),
    );
    const editedPointer = await readJson<typeof pointer>(
      edited.output,
      lookupPath,
    );
    assert.notEqual(editedPointer.detailUrl, pointer.detailUrl);
    assert.equal(
      editedPointer.detailUrl,
      edited.state.teams[teamId].events[eventId].path,
    );
    assert.equal(
      (
        await readJson<{ event: PublicEvent }>(
          edited.output,
          editedPointer.detailUrl,
        )
      ).event.title,
      "Edited title",
    );
    assert.ok(!(pointer.detailUrl.slice(1) in edited.state.files));
    // The unchanged event pointer and detail are hard-linked; search/listing behavior is preserved.
    for (const path of [
      `teams/${teamId}/events/${anotherId}/manifest.json`,
      first.state.teams[teamId].events[anotherId].path.slice(1),
    ]) {
      assert.equal(
        (await stat(join(first.output, path))).ino,
        (await stat(join(edited.output, path))).ino,
      );
    }
    assert.deepEqual(
      first.state.teams[otherTeamId],
      edited.state.teams[otherTeamId],
    );
    const unpublished = await h.build(
      snapshot([team(teamId, [event(anotherId, teamId)])], false),
    );
    assert.ok(!(lookupPath.slice(1) in unpublished.state.files));
    await assert.rejects(
      readFile(join(unpublished.output, lookupPath.slice(1))),
      { code: "ENOENT" },
    );
    // Deleting a team's final public event removes both discovery and all its pointers.
    const removed = await h.build(snapshot([], false, [teamId]));
    assert.ok(!(teamId in removed.state.teams));
    assert.ok(
      !Object.keys(removed.state.files).some((path) =>
        path.startsWith(`teams/${teamId}/`),
      ),
    );
    assert.ok(
      !Object.keys(removed.state.files).some((path) =>
        /\.html$|^_redirects$/.test(path),
      ),
    );
  } finally {
    await h.cleanup();
  }
});

test("lookup pointers remain valid across daily rollover and edited archive transitions", async () => {
  const h = await harness();
  try {
    const fixture = event("rollover", "team", "2026-11-05T13:00:00Z");
    const pointerPath = "/teams/team/events/rollover/manifest.json";
    const first = await h.build(snapshot([team("team", [fixture])]));
    const before = await readJson<EventLookupManifest>(
      first.output,
      pointerPath,
    );
    const archived = await h.build(
      snapshot([team("team", [fixture])]),
      new Date("2026-11-06T00:00:00Z"),
    );
    assert.equal(
      archived.state.teams.team.events.rollover.scope,
      "archive/2026",
    );
    const after = await readJson<typeof before>(archived.output, pointerPath);
    assert.deepEqual(
      after,
      before,
      "Time-only rollover does not change event content or stable lookup",
    );
    assert.ok(after.detailUrl.slice(1) in archived.state.files);
    const moved = await h.build(
      snapshot(
        [team("team", [{ ...fixture, startDate: "2025-01-01T12:00:00Z" }])],
        false,
      ),
    );
    const movedPointer = await readJson<typeof before>(
      moved.output,
      pointerPath,
    );
    assert.notEqual(movedPointer.detailUrl, before.detailUrl);
    assert.equal(
      movedPointer.detailUrl,
      moved.state.teams.team.events.rollover.path,
    );
    assert.equal(moved.state.teams.team.events.rollover.scope, "archive/2025");
  } finally {
    await h.cleanup();
  }
});

test("lookup headers revalidate with public CORS while event JSON remains immutable", async () => {
  const h = await harness();
  try {
    const built = await h.build(
      snapshot([team("team", [event("event", "team")])]),
    );
    const headers = await readFile(join(built.output, "_headers"), "utf8");
    const rules = headers.split(/\n(?=\/)/).map((block) => {
      const [pattern, ...lines] = block.trim().split("\n");
      const matcher = new RegExp(
        `^${pattern
          .split("/")
          .map((segment) =>
            segment === "*"
              ? ".*"
              : segment.startsWith(":")
                ? "[^/]+"
                : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join("/")}$`,
      );
      return { matcher, headers: lines.map((line) => line.trim()) };
    });
    const values = (path: string, key: string) =>
      rules
        .filter((rule) => rule.matcher.test(path))
        .flatMap((rule) =>
          rule.headers
            .filter((line) =>
              line.toLowerCase().startsWith(`${key.toLowerCase()}:`),
            )
            .map((line) => line.slice(line.indexOf(":") + 1).trim()),
        );
    for (const path of [
      "/teams/team/manifest.json",
      "/teams/team/events/event/manifest.json",
    ]) {
      assert.deepEqual(values(path, "Cache-Control"), [
        "public, max-age=0, must-revalidate",
      ]);
      assert.deepEqual(values(path, "Access-Control-Allow-Origin"), ["*"]);
    }
    assert.deepEqual(
      values(built.state.teams.team.events.event.path, "Cache-Control"),
      ["public, max-age=31536000, immutable"],
    );
  } finally {
    await h.cleanup();
  }
});

test("deployment validation rejects dangling, stale and cross-team event pointers", async () => {
  const h = await harness();
  try {
    const built = await h.build(
      snapshot([
        team("team", [event("event", "team")]),
        team("other", [event("foreign", "other")]),
      ]),
    );
    const pointerPath = "teams/team/events/event/manifest.json";
    const pointer = await readJson<EventLookupManifest>(
      built.output,
      pointerPath,
    );
    const missing = { ...built.state.files };
    delete missing[pointer.detailUrl.slice(1)];
    await assert.rejects(
      validateFeed(built.output, missing),
      /Unresolved public data reference/,
    );
    // Write by rename to avoid changing hard-linked successful artifacts.
    const write = async (value: unknown) => {
      const { writeFile, rename } = await import("node:fs/promises");
      const temporary = join(built.output, "pointer-test.tmp");
      await writeFile(temporary, JSON.stringify(value));
      await rename(temporary, join(built.output, pointerPath));
    };
    await write({
      ...pointer,
      detailUrl: built.state.teams.other.events.foreign.path,
    });
    await assert.rejects(
      validateFeed(built.output, built.state.files),
      /Invalid event lookup manifest|Event detail has no matching lookup pointer/,
    );
    await write({ ...pointer, eventId: "wrong" });
    await assert.rejects(
      validateFeed(built.output, built.state.files),
      /Invalid event lookup manifest|Event detail has no matching lookup pointer/,
    );
    const absent = { ...built.state.files };
    delete absent[pointerPath];
    await assert.rejects(
      validateFeed(built.output, absent),
      /Unresolved public data reference/,
    );
  } finally {
    await h.cleanup();
  }
});

test("removed lookups return HTTP 404 from the generated static directory without an HTML fallback", async () => {
  const h = await harness();
  let activeOutput = "";
  const server = createServer(async (request, response) => {
    try {
      // Serve only files in the active artifact directory, like a static origin.
      const path = request.url?.slice(1) ?? "";
      if (!/^[a-zA-Z0-9_/.%-]+$/.test(path) || path.includes("..")) {
        response.writeHead(400).end();
        return;
      }
      const body = await readFile(join(activeOutput, path));
      response.writeHead(200, { "Content-Type": "application/json" }).end(body);
    } catch {
      response
        .writeHead(404, { "Content-Type": "text/plain" })
        .end("Not found");
    }
  });
  try {
    const initial = await h.build(
      snapshot([team("team", [event("event", "team")])]),
    );
    activeOutput = initial.output;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/teams/team/events/event/manifest.json`;
    const available = await fetch(url);
    assert.equal(available.status, 200);
    const pointer = await available.json();
    assert.equal(pointer.detailUrl, initial.state.teams.team.events.event.path);
    const removed = await h.build(snapshot([], false, ["team"]));
    activeOutput = removed.output;
    assert.ok(!("_redirects" in removed.state.files));
    const missing = await fetch(url);
    assert.equal(missing.status, 404);
    assert.ok(!missing.headers.get("content-type")?.includes("text/html"));
    assert.equal(await missing.text(), "Not found");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await h.cleanup();
  }
});
