import assert from "node:assert/strict";
import test from "node:test";
import {
  chainOrderBy,
  formatRecordSorts,
  MAX_PAGE_SIZE,
  nextSorts,
  readList,
  readListRequest,
} from "@/lib/list-request";

/* The list reader (lib/list-request): page, page size and order. */

const FIELDS = ["name", "city", "email", "createdAt"] as const;
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
    sorts: [{ field: "name", direction: "desc" }],
  });
});

test("without them: page 1, the list's page size (else 50), the fallback", () => {
  assert.deepEqual(read(""), {
    page: 1,
    pageSize: 50,
    sort: FALLBACK,
    sorts: [FALLBACK],
  });
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
  const request = readListRequest(params, { sort: FIELDS });
  assert.equal(request.sort, undefined);
  assert.deepEqual(request.sorts, []);
});

test("optional paging: unpaged unless a page or page size is asked for", () => {
  const optional = { sort: FIELDS, paging: "optional" } as const;
  assert.equal(readList(new URLSearchParams("query=x"), optional), null);
  assert.equal(readList(new URLSearchParams("page=1"), optional)?.pageSize, 50);
  assert.equal(readList(new URLSearchParams("pageSize=10"), optional)?.page, 1);
  assert.notEqual(readList(new URLSearchParams(""), { sort: FIELDS }), null);
});

test("several orders, most important first", () => {
  assert.deepEqual(read("sort=city:desc,name:asc").sorts, [
    { field: "city", direction: "desc" },
    { field: "name", direction: "asc" },
  ]);
  assert.deepEqual(read("sort=city:desc,name").sort, {
    field: "city",
    direction: "desc",
  });
});

test("unknown fields and repeats are dropped; at most three orders", () => {
  assert.deepEqual(read("sort=city:asc,passwordHash:asc,city:desc").sorts, [
    { field: "city", direction: "asc" },
  ]);
  assert.deepEqual(
    read("sort=name:asc,city:asc,email:asc,createdAt:asc").sorts.map(
      (sort) => sort.field,
    ),
    ["name", "city", "email"],
  );
  assert.deepEqual(read("sort=passwordHash:asc").sorts, [FALLBACK]);
});

test("formats orders for a query string", () => {
  assert.equal(
    formatRecordSorts([
      { field: "name", direction: "asc" },
      { field: "city", direction: "desc" },
    ]),
    "name:asc,city:desc",
  );
  assert.equal(formatRecordSorts([]), "");
  // What it writes, it reads back.
  assert.deepEqual(read("sort=name:asc,city:desc").sorts, [
    { field: "name", direction: "asc" },
    { field: "city", direction: "desc" },
  ]);
});

test("chains each order's steps, then the tie-breaker", () => {
  const steps = chainOrderBy<string, Record<string, string>>(
    [
      { field: "name", direction: "asc" },
      { field: "city", direction: "desc" },
    ],
    (sort): Record<string, string> | Record<string, string>[] =>
      sort.field === "name"
        ? [{ name: sort.direction }, { url: sort.direction }]
        : { [sort.field]: sort.direction },
    { id: "asc" },
  );
  assert.deepEqual(steps, [
    { name: "asc" },
    { url: "asc" },
    { city: "desc" },
    { id: "asc" },
  ]);
});

const asc = (field: string) => ({ field, direction: "asc" as const });
const desc = (field: string) => ({ field, direction: "desc" as const });

test("a click sorts by that column alone: ascending, descending, off", () => {
  assert.deepEqual(nextSorts([], "name", false), [asc("name")]);
  assert.deepEqual(nextSorts([asc("name")], "name", false), [desc("name")]);
  assert.deepEqual(nextSorts([desc("name")], "name", false), []);
  // With several orders, a plain click starts over with that column.
  assert.deepEqual(nextSorts([asc("city"), desc("name")], "name", false), [
    asc("name"),
  ]);
  assert.deepEqual(nextSorts([asc("city")], "name", false), [asc("name")]);
});

test("a Shift-click adds, turns and removes one order, keeping the rest", () => {
  const two = [asc("city"), asc("name")];
  assert.deepEqual(nextSorts([asc("city")], "name", true), two);
  assert.deepEqual(nextSorts(two, "name", true), [asc("city"), desc("name")]);
  assert.deepEqual(nextSorts([asc("city"), desc("name")], "name", true), [
    asc("city"),
  ]);
  // The first order turns and goes the same way; the others move up.
  assert.deepEqual(nextSorts([desc("city"), asc("name")], "city", true), [
    asc("name"),
  ]);
  // No more than three.
  const three = [asc("city"), asc("name"), asc("email")];
  assert.deepEqual(nextSorts(three, "createdAt", true), three);
});
