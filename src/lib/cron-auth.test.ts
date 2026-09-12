import assert from "node:assert/strict";
import test from "node:test";
import { hasValidBearerSecret } from "@/lib/cron-auth";

test("accepts only the configured bearer secret", () => {
  assert.equal(hasValidBearerSecret("Bearer correct-secret", "correct-secret"), true);
  assert.equal(hasValidBearerSecret("Bearer wrong-secret", "correct-secret"), false);
  assert.equal(hasValidBearerSecret("Basic correct-secret", "correct-secret"), false);
  assert.equal(hasValidBearerSecret(null, "correct-secret"), false);
  assert.equal(hasValidBearerSecret("Bearer correct-secret", undefined), false);
});
