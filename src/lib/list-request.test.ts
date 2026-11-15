import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRecordSort,
  MAX_PAGE_SIZE,
  readList,
  readListRequest,
} from "@/lib/list-request";

/* The list reader (lib/list-request): page, page size and order. */

const FIELDS = ["name", "createdAt"] as const;
const FALLBACK = { field: "createdAt", direction: "desc" } as const;
const read = (query: string, options = {}) =>
  readListRequest(new URLSearchParams(query), {
    sort: FIELDS,
    fallback: FALLBACK,
    ...options,
  });

test("reads the page, page size and an allowed order", () => {
  assert.deepEqual(read("page=2&pageSize=20&sort=name&dir=desc"), {
    page: 2,
    pageSize: 20,
    sort: { field: "name", direction: "desc" },
  });
});

test("without them: page 1, the list's page size (else 50), the fallback", () => {
  assert.deepEqual(read(""), { page: 1, pageSize: 50, sort: FALLBACK });
  assert.equal(read("", { pageSize: 12 }).pageSize, 12);
});

test("broken numbers fall back; the page size has a ceiling", () => {
  assert.deepEqual(read("page=-3&pageSize=abc"), read(""));
  assert.equal(read("page=2.7").page, 2);
  assert.equal(read("pageSize=0").pageSize, 50);
  assert.equal(read("pageSize=5000").pageSize, MAX_PAGE_SIZE);
});

test("only allowed fields order the list; the direction defaults to ascending", () => {
  assert.deepEqual(read("sort=passwordHash&dir=asc").sort, FALLBACK);
  assert.deepEqual(read("sort=name&dir=sideways").sort, {
    field: "name",
    direction: "asc",
  });
});

test("without a fallback, no order unless one is asked for", () => {
  const params = new URLSearchParams("");
  assert.equal(readListRequest(params, { sort: FIELDS }).sort, undefined);
});

test("optional paging: unpaged unless a page or page size is asked for", () => {
  const optional = { sort: FIELDS, paging: "optional" } as const;
  assert.equal(readList(new URLSearchParams("query=x"), optional), null);
  assert.equal(readList(new URLSearchParams("page=1"), optional)?.pageSize, 50);
  assert.equal(readList(new URLSearchParams("pageSize=10"), optional)?.page, 1);
  assert.notEqual(readList(new URLSearchParams(""), { sort: FIELDS }), null);
});

test("formats an order for a query string", () => {
  assert.equal(
    formatRecordSort({ field: "name", direction: "asc" }),
    "&sort=name&dir=asc",
  );
  assert.equal(formatRecordSort(null), "");
});
