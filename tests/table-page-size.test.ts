import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTablePageSizeCookie,
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  TABLE_PAGE_SIZE_COOKIE,
  TABLE_PAGE_SIZES,
} from "@/lib/table-page-size";

test("accepts each supported table page size", () => {
  for (const pageSize of TABLE_PAGE_SIZES) {
    assert.equal(parseTablePageSize(String(pageSize)), pageSize);
  }
});

test("falls back to the default for missing or unsupported values", () => {
  for (const value of [undefined, "", "0", "25", "1000", "invalid"]) {
    assert.equal(parseTablePageSize(value), DEFAULT_TABLE_PAGE_SIZE);
  }
});

test("builds a long-lived, site-wide page-size cookie", () => {
  assert.equal(
    buildTablePageSizeCookie(50),
    `${TABLE_PAGE_SIZE_COOKIE}=50; Path=/; Max-Age=31536000; SameSite=Lax`,
  );
  assert.equal(
    buildTablePageSizeCookie(100, true),
    `${TABLE_PAGE_SIZE_COOKIE}=100; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
  );
});
