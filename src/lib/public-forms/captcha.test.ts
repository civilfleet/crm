import assert from "node:assert/strict";
import test from "node:test";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import {
  CAPTCHA_LIFETIME_MS,
  checkFormCaptcha,
  createFormChallenge,
  readCaptchaDifficulty,
  readCaptchaMode,
} from "@/lib/public-forms/captcha";

/* The form captcha: a puzzle we sign, the widget solves, the bridge checks. */

const KEY = "captcha-test-key";
// Cheap enough to solve in a test.
const EASY = { cost: 10, minCounter: 5, maxCounter: 20 };

const solve = async (key = KEY, now = Date.now()) => {
  const challenge = await createFormChallenge(key, EASY, now);
  const solution = await solveChallenge({ challenge, deriveKey });
  assert.ok(solution, "solvable");
  return { challenge, solution };
};
const header = (payload: unknown) =>
  Buffer.from(JSON.stringify(payload)).toString("base64");

test("a solved puzzle we signed passes, once per signature", async () => {
  const solved = await solve();
  const result = await checkFormCaptcha(header(solved), KEY);
  assert.deepEqual(result, { ok: true, id: solved.challenge.signature });
  assert.equal(solved.challenge.parameters.algorithm, "PBKDF2/SHA-256");
  assert.ok(solved.challenge.parameters.expiresAt);
});

test("a wrong answer, someone else's puzzle or an old one fails", async () => {
  const solved = await solve();
  // The proof is the derived key (only reachable by doing the work); a
  // made-up one fails.
  const flipped = solved.solution.derivedKey.startsWith("0") ? "1" : "0";
  const wrong = {
    ...solved,
    solution: {
      ...solved.solution,
      derivedKey: flipped + solved.solution.derivedKey.slice(1),
    },
  };
  assert.deepEqual(await checkFormCaptcha(header(wrong), KEY), {
    ok: false,
    reason: "invalid",
  });

  const foreign = await solve("another key");
  assert.equal((await checkFormCaptcha(header(foreign), KEY)).ok, false);

  // Raising the difficulty on our side after signing is caught too.
  const tampered = structuredClone(solved);
  tampered.challenge.parameters.cost = 1;
  assert.equal((await checkFormCaptcha(header(tampered), KEY)).ok, false);

  const old = await solve(KEY, Date.now() - CAPTCHA_LIFETIME_MS - 1000);
  assert.deepEqual(await checkFormCaptcha(header(old), KEY), {
    ok: false,
    reason: "expired",
  });
});

test("missing or malformed headers are told apart", async () => {
  assert.deepEqual(await checkFormCaptcha(undefined, KEY), {
    ok: false,
    reason: "missing",
  });
  for (const value of ["not base64 json", header({}), header({ challenge: 1 })])
    assert.deepEqual(await checkFormCaptcha(value, KEY), {
      ok: false,
      reason: "malformed",
    });
  assert.deepEqual(await checkFormCaptcha("x".repeat(9000), KEY), {
    ok: false,
    reason: "malformed",
  });
});

test("mode and difficulty come from configuration, with safe defaults", () => {
  assert.equal(readCaptchaMode(undefined), "off");
  assert.equal(readCaptchaMode("required"), "required");
  assert.equal(readCaptchaMode("REQUIRED"), "off");
  assert.deepEqual(readCaptchaDifficulty({}), {
    cost: 5000,
    minCounter: 2000,
    maxCounter: 6000,
  });
  assert.deepEqual(
    readCaptchaDifficulty({
      CAPTCHA_COST: "8000",
      CAPTCHA_MIN_COUNTER: "9000",
      CAPTCHA_MAX_COUNTER: "100",
    }),
    { cost: 8000, minCounter: 9000, maxCounter: 9000 },
  );
  assert.equal(readCaptchaDifficulty({ CAPTCHA_COST: "-1" }).cost, 5000);
});
