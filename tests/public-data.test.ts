import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildFeed,
  cleanEvent,
  validateFeed,
} from "../src/lib/public-data/build";
import type {
  FeedState,
  SearchIndexer,
  SourceSnapshot,
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
