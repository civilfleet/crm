import assert from "node:assert/strict";
import test from "node:test";
import { consumerErrorCodes } from "../src/lib/public-events/consumer-errors";

test("consumer diagnostics retain nested network errors without secret messages", () => {
  const cause = Object.assign(new Error("password=do-not-log"), {
    code: "ENOTFOUND",
  });
  assert.deepEqual(
    consumerErrorCodes(new Error("wss://user:secret@host", { cause })),
    ["ENOTFOUND"],
  );
});

test("consumer diagnostics tolerate unknown errors and cyclic causes", () => {
  assert.deepEqual(consumerErrorCodes(null), ["UNKNOWN"]);
  assert.deepEqual(consumerErrorCodes({ code: "password=secret" }), [
    "UNKNOWN",
  ]);
  const error: { code: number; cause?: unknown } = { code: 404 };
  error.cause = error;
  assert.deepEqual(consumerErrorCodes(error), ["404"]);
});
