import assert from "node:assert/strict";
import test from "node:test";
import {
  EUROPEAN_COUNTRY_CODES,
  EUROPEAN_COUNTRY_OPTIONS,
  normalizeCountryCode,
} from "../lib/countries";
import {
  buildDomainVerificationRecordName,
  buildDomainVerificationRecordValue,
  generateDomainVerificationToken,
} from "../lib/domain-verification";
import { normalizePostalCode } from "../lib/geo";
import { generateSlug } from "../lib/slug";

test("normalizeCountryCode resolves ISO codes and localized country names", () => {
  assert.equal(normalizeCountryCode("de"), "DE");
  assert.equal(normalizeCountryCode(" Österreich "), "AT");
  assert.equal(normalizeCountryCode("The Netherlands"), "NL");
  assert.equal(normalizeCountryCode("unknown"), undefined);
  assert.equal(normalizeCountryCode("   "), undefined);
});

test("country exports stay aligned for forms and validation", () => {
  assert.ok(EUROPEAN_COUNTRY_CODES.includes("DE"));
  assert.ok(
    EUROPEAN_COUNTRY_OPTIONS.some(
      (option) => option.code === "DE" && option.label === "Germany (DE)",
    ),
  );
});

test("normalizePostalCode trims, uppercases, and collapses whitespace", () => {
  assert.equal(normalizePostalCode("  sw1a   1aa "), "SW1A 1AA");
  assert.equal(normalizePostalCode("10115"), "10115");
  assert.equal(normalizePostalCode("   "), undefined);
});

test("generateSlug removes punctuation and normalizes separators", () => {
  assert.equal(generateSlug("  Hello, World!  "), "hello-world");
  assert.equal(generateSlug("Funding_Request__2026"), "funding-request-2026");
  assert.equal(generateSlug("Already---slugged"), "already-slugged");
});

test("domain verification helpers generate the expected record values", () => {
  assert.equal(
    buildDomainVerificationRecordName("example.org"),
    "_fm-sso.example.org",
  );
  assert.equal(
    buildDomainVerificationRecordValue("token123"),
    "fm-verify-token123",
  );

  const token = generateDomainVerificationToken();
  assert.match(token, /^[a-f0-9]{32}$/);
});
