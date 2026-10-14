import assert from "node:assert/strict";
import test from "node:test";
import { isPreviewDemoEnabled } from "./preview-demo";

test("enables preview demo mode only for the exact value true", () => {
  assert.equal(isPreviewDemoEnabled("true"), true);
  assert.equal(isPreviewDemoEnabled("false"), false);
  assert.equal(isPreviewDemoEnabled("TRUE"), false);
  assert.equal(isPreviewDemoEnabled(undefined), false);
});
