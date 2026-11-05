import assert from "node:assert/strict";
import test from "node:test";
import { createPublicDataPool } from "../src/lib/public-data/runtime";

test("idle database failures are handled without logging client credentials", async () => {
  const pool = createPublicDataPool({
    connectionString: "postgresql://user:fixture-secret@127.0.0.1/test",
  });
  const original = console.error;
  const messages: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    messages.push(args);
  };
  try {
    const error = Object.assign(
      new Error(
        "terminating connection due to administrator command fixture-secret",
      ),
      { code: "57P01" },
    );
    assert.doesNotThrow(() =>
      pool.emit("error", error, { password: "fixture-secret" }),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0][1], "57P01");
    assert.ok(!JSON.stringify(messages).includes("fixture-secret"));
    assert.equal(pool.ending, false);
  } finally {
    console.error = original;
    await pool.end();
  }
});
