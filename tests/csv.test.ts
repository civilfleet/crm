import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "@/lib/csv";

test("parseCsv parses quoted fields and escaped quotes", () => {
  const parsed = parseCsv(
    'name,email,notes\r\n"Jane Doe",jane@example.org,"Line one, ""quoted"""\r\n',
  );

  assert.deepEqual(parsed.headers, ["name", "email", "notes"]);
  assert.deepEqual(parsed.rows, [
    ["Jane Doe", "jane@example.org", 'Line one, "quoted"'],
  ]);
});

test("parseCsv ignores blank lines", () => {
  const parsed = parseCsv("\nname,email\n\nAda,ada@example.org\n\n");

  assert.deepEqual(parsed.headers, ["name", "email"]);
  assert.deepEqual(parsed.rows, [["Ada", "ada@example.org"]]);
});