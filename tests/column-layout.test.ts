import assert from "node:assert/strict";
import { test } from "node:test";
import { clampWidth, displayOrder, moveColumnId } from "@/lib/column-layout";

test("column order: pinned first, then the saved order, then new columns", () => {
  const ids = ["name", "email", "phone", "city", "notes"];
  const pinned = new Set(["name"]);
  assert.deepEqual(displayOrder(ids, pinned, []), ids);
  assert.deepEqual(displayOrder(ids, pinned, ["city", "email"]), [
    "name",
    "city",
    "email",
    "phone",
    "notes",
  ]);
  // A column gone since, or a pinned one in the saved order, is ignored.
  assert.deepEqual(displayOrder(ids, pinned, ["gone", "name", "notes"]), [
    "name",
    "notes",
    "email",
    "phone",
    "city",
  ]);
});

test("moving a column lands it before or after the target", () => {
  const order = ["a", "b", "c", "d"];
  assert.deepEqual(moveColumnId(order, "d", "b", "before"), [
    "a",
    "d",
    "b",
    "c",
  ]);
  assert.deepEqual(moveColumnId(order, "a", "c", "after"), [
    "b",
    "c",
    "a",
    "d",
  ]);
  assert.deepEqual(moveColumnId(order, "b", "b", "after"), order);
  assert.deepEqual(moveColumnId(order, "b", "missing", "after"), order);
});

test("a dragged width stays within bounds", () => {
  assert.equal(clampWidth(10), 60);
  assert.equal(clampWidth(240.6), 241);
  assert.equal(clampWidth(5000), 1200);
});
