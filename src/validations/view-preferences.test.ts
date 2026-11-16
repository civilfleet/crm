import assert from "node:assert/strict";
import test from "node:test";
import {
  getViewKeyScope,
  MAX_VIEW_SETTINGS_BYTES,
  saveViewPreferenceSchema,
  viewKeySchema,
} from "@/validations/view-preferences";

const TEAM = "4a687998-3d5c-4187-aa0b-10bbe1eeb545";
const KEY = `transactions:team:${TEAM}`;

test("accepts list keys scoped to a team, an organization or admin", () => {
  for (const key of [
    KEY,
    `organizations:funding:team:${TEAM}`,
    `funding-requests:org:${TEAM}`,
    "teams:admin",
  ]) {
    assert.ok(viewKeySchema.safeParse(key).success, key);
  }
});

test("rejects keys without a scope, or oddly shaped", () => {
  for (const key of [
    "",
    "transactions",
    `transactions:${TEAM}`,
    "transactions:team:not-a-uuid",
    `Transactions:team:${TEAM}`,
    "people/../admin",
    `${"x".repeat(80)}:team:${TEAM}`,
  ]) {
    assert.equal(viewKeySchema.safeParse(key).success, false, key);
  }
});

test("a key names the team, organization or admin area it belongs to", () => {
  assert.deepEqual(getViewKeyScope(KEY), { kind: "team", id: TEAM });
  assert.deepEqual(getViewKeyScope(`files:org:${TEAM}`), {
    kind: "org",
    id: TEAM,
  });
  assert.deepEqual(getViewKeyScope("teams:admin"), { kind: "admin" });
});

test("accepts a full set of view settings", () => {
  const result = saveViewPreferenceSchema.safeParse({
    key: KEY,
    settings: {
      columns: { receipt: true, organization: false },
      sort: { field: "amount", direction: "desc" },
      view: "cards",
      filters: [{ key: "receipt", values: ["missing"] }],
    },
  });
  assert.ok(result.success);
});

test("allows clearing the sort", () => {
  assert.ok(
    saveViewPreferenceSchema.safeParse({ key: KEY, settings: { sort: null } })
      .success,
  );
});

test("rejects unknown settings and bad values", () => {
  for (const settings of [
    { theme: "dark" },
    { density: "compact" },
    { view: "kanban" },
    { sort: { field: "name", direction: "sideways" } },
  ]) {
    assert.equal(
      saveViewPreferenceSchema.safeParse({ key: KEY, settings }).success,
      false,
      JSON.stringify(settings),
    );
  }
});

test("the size limit leaves room for many filters", () => {
  const filters = Array.from({ length: 50 }, (_, index) => ({
    key: `field-${index}`,
    values: ["a value"],
  }));
  assert.ok(JSON.stringify({ filters }).length < MAX_VIEW_SETTINGS_BYTES);
});

test("saves several orders, at most three; old single orders still load", () => {
  const sort = (field: string) => ({ field, direction: "asc" as const });
  assert.ok(
    saveViewPreferenceSchema.safeParse({
      key: KEY,
      settings: { sorts: [sort("name"), sort("city")] },
    }).success,
  );
  assert.equal(
    saveViewPreferenceSchema.safeParse({
      key: KEY,
      settings: {
        sorts: [sort("a"), sort("b"), sort("c"), sort("d")],
      },
    }).success,
    false,
  );
  assert.ok(
    saveViewPreferenceSchema.safeParse({
      key: KEY,
      settings: { sort: sort("name") },
    }).success,
  );
});
