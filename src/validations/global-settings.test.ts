import assert from "node:assert/strict";
import test from "node:test";
import { globalSettingsSchema } from "@/validations/global-settings";

test("global settings accept HTTPS and mailto contact links", () => {
  for (const accountCreationContactUrl of [
    "https://support.example.org/join",
    "mailto:support@example.org",
  ]) {
    assert.equal(
      globalSettingsSchema.safeParse({ accountCreationContactUrl }).success,
      true,
    );
  }
});

test("global settings reject unsafe or relative contact links", () => {
  for (const accountCreationContactUrl of [
    "javascript:alert(1)",
    "http://support.example.org",
    "/contact",
  ]) {
    assert.equal(
      globalSettingsSchema.safeParse({ accountCreationContactUrl }).success,
      false,
    );
  }
});
