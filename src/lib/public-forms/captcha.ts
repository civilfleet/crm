import { createHmac } from "node:crypto";
import {
  type Challenge,
  createChallenge,
  randomInt,
  type Solution,
  verifySolution,
} from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";

/*
  Proof-of-work captcha for website forms (ALTCHA, protocol of widget 3.x).
  The public bridge hands out a signed puzzle (GET /v1/forms/challenge); the
  website's widget solves it while the person fills in the form and sends
  the result in the X-Altcha header with the submission. Nothing leaves our
  servers: no third party, no cookies, no tracking.

  Each solved puzzle counts once (the bridge records used ones in NATS), and
  expires after CAPTCHA_LIFETIME_MS. The difficulty is configuration, so it
  can be raised during an attack without a website change.
*/

export const FORM_CHALLENGE_PATH = "/v1/forms/challenge";
export const CAPTCHA_HEADER = "x-altcha";
export const CAPTCHA_LIFETIME_MS = 10 * 60_000;
export const CAPTCHA_USED_STREAM = "SEAWATCH_CAPTCHA_USED";
export const CAPTCHA_USED_SUBJECT = "seawatch.captcha.used";
export const CAPTCHA_ALGORITHM = "PBKDF2/SHA-256";

/** off: not checked; optional: checked when sent; required: needed. */
export type CaptchaMode = "off" | "optional" | "required";
export const readCaptchaMode = (value?: string): CaptchaMode =>
  value === "required" || value === "optional" ? value : "off";

export type CaptchaDifficulty = {
  /** PBKDF2 iterations per attempt. */
  cost: number;
  /** The answer lies between these; the widget tries from zero. */
  minCounter: number;
  maxCounter: number;
};
export const DEFAULT_CAPTCHA_DIFFICULTY: CaptchaDifficulty = {
  cost: 5_000,
  minCounter: 2_000,
  maxCounter: 6_000,
};
export const readCaptchaDifficulty = (
  env: Record<string, string | undefined>,
): CaptchaDifficulty => {
  const number = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  const cost = number(env.CAPTCHA_COST, DEFAULT_CAPTCHA_DIFFICULTY.cost);
  const minCounter = number(
    env.CAPTCHA_MIN_COUNTER,
    DEFAULT_CAPTCHA_DIFFICULTY.minCounter,
  );
  const maxCounter = Math.max(
    minCounter,
    number(env.CAPTCHA_MAX_COUNTER, DEFAULT_CAPTCHA_DIFFICULTY.maxCounter),
  );
  return { cost, minCounter, maxCounter };
};

/** The library wants two secrets; both are derived from one configured key. */
const secrets = (key: string) => ({
  hmacSignatureSecret: createHmac("sha256", key)
    .update("altcha:signature")
    .digest("hex"),
  hmacKeySignatureSecret: createHmac("sha256", key)
    .update("altcha:key-signature")
    .digest("hex"),
});

export const createFormChallenge = (
  key: string,
  difficulty: CaptchaDifficulty,
  now = Date.now(),
) =>
  createChallenge({
    algorithm: CAPTCHA_ALGORITHM,
    cost: difficulty.cost,
    counter: randomInt(difficulty.maxCounter, difficulty.minCounter),
    deriveKey,
    expiresAt: new Date(now + CAPTCHA_LIFETIME_MS),
    ...secrets(key),
  });

export type CaptchaCheck =
  | { ok: true; id: string }
  | { ok: false; reason: "missing" | "malformed" | "invalid" | "expired" };

/**
 * Checks the X-Altcha header: base64 JSON {challenge, solution}, signed by
 * us, not expired, solved. Returns an id for the single-use record.
 */
export const checkFormCaptcha = async (
  header: string | undefined,
  key: string,
): Promise<CaptchaCheck> => {
  if (!header) return { ok: false, reason: "missing" };
  if (header.length > 8192) return { ok: false, reason: "malformed" };
  let payload: { challenge?: Challenge; solution?: Solution };
  try {
    payload = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const { challenge, solution } = payload;
  if (
    !challenge?.parameters ||
    typeof challenge.signature !== "string" ||
    !solution ||
    typeof solution.counter !== "number" ||
    challenge.parameters.algorithm !== CAPTCHA_ALGORITHM
  )
    return { ok: false, reason: "malformed" };
  try {
    const result = await verifySolution({
      challenge,
      solution,
      deriveKey,
      ...secrets(key),
    });
    if (result.expired) return { ok: false, reason: "expired" };
    if (!result.verified) return { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, id: challenge.signature };
};
