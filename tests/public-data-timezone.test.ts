import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import {
  publicEventTimeZone,
  readPublicData,
} from "../src/lib/public-data/source";

test("public export preserves valid timezones and defaults invalid legacy values", () => {
  assert.equal(publicEventTimeZone("Berlin"), "Europe/Berlin");
  assert.equal(publicEventTimeZone("Invalid/Zone"), "Europe/Berlin");
  assert.equal(publicEventTimeZone("  "), "Europe/Berlin");
  assert.equal(publicEventTimeZone(" America/New_York "), "America/New_York");
  assert.equal(publicEventTimeZone("UTC"), "UTC");
});

test("a legacy timezone cannot block a team's export or alter stored timestamps", async () => {
  const startDate = new Date("2026-12-01T12:00:00Z");
  const stored = {
    id: "legacy-event",
    teamId: "team",
    timeZone: "Berlin",
    startDate,
    endDate: null,
    postalCode: "",
    countryCode: null,
  };
  const responses = [
    {
      rows: [
        {
          id: "team",
          name: "Team",
          email: "public@example.org",
          website: null,
        },
      ],
    },
    { rows: [stored] },
    { rows: [] },
  ];
  const client = {
    query: async () => {
      const response = responses.shift();
      assert.ok(response, "Exporter must only perform its three read queries");
      return response;
    },
  } as unknown as PoolClient;
  const result = await readPublicData(client, null, false);
  const exported = result.teams[0].events[0];
  assert.equal(exported.timeZone, "Europe/Berlin");
  assert.equal(exported.startDate, startDate.toISOString());
  assert.equal(stored.timeZone, "Berlin");
  assert.equal(responses.length, 0);
});
