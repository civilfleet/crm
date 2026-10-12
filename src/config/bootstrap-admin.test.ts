import assert from "node:assert/strict";
import test from "node:test";
import { resolveBootstrapAdminEmails } from "./bootstrap-admin";

test("resolves legacy and comma-separated bootstrap admin emails", () => {
  assert.deepEqual(
    resolveBootstrapAdminEmails({
      BOOTSTRAP_ADMIN_EMAIL: "legacy@example.org",
      BOOTSTRAP_ADMIN_EMAILS:
        "alice@example.org, bob@example.org,carol@example.org",
    }),
    [
      "legacy@example.org",
      "alice@example.org",
      "bob@example.org",
      "carol@example.org",
    ],
  );
});

test("trims, ignores empty entries, and deduplicates case-insensitively", () => {
  assert.deepEqual(
    resolveBootstrapAdminEmails({
      BOOTSTRAP_ADMIN_EMAIL: " Admin@example.org ",
      BOOTSTRAP_ADMIN_EMAILS: "admin@example.org,, second@example.org, ",
    }),
    ["admin@example.org", "second@example.org"],
  );
});

test("rejects an invalid bootstrap admin email", () => {
  assert.throws(
    () =>
      resolveBootstrapAdminEmails({
        BOOTSTRAP_ADMIN_EMAILS: "admin@example.org,not-an-email",
      }),
    /must contain valid email addresses/,
  );
});
