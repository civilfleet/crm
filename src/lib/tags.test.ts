import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTagName, normalizeTagNames } from "@/lib/tags";

test("normalizes tag names for team-level uniqueness", () => {
  assert.equal(normalizeTagName("  ##Sea   Rescue  "), "sea rescue");
});

test("normalizes compatibility characters", () => {
  assert.equal(normalizeTagName("ＳＯＳ"), "sos");
});

test("normalizes, deduplicates, and sorts tag arrays", () => {
  assert.deepEqual(
    normalizeTagNames(["  Berlin", "#sea   rescue", "BERLIN"]),
    ["berlin", "sea rescue"],
  );
});

test("rejects empty and oversized tag names", () => {
  assert.throws(() => normalizeTagName("###  "), /required/);
  assert.throws(() => normalizeTagName("x".repeat(65)), /at most 64/);
});
