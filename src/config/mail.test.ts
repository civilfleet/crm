import assert from "node:assert/strict";
import test from "node:test";
import { resolveMailConfiguration } from "./mail";

test("production SMTP configuration fails fast when required values are missing", () => {
  assert.throws(
    () => resolveMailConfiguration({ NODE_ENV: "production" }),
    /SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM/,
  );
  assert.throws(
    () =>
      resolveMailConfiguration({
        NODE_ENV: "development",
        SMTP_HOST: "smtp.example.org",
      }),
    /SMTP_USER, SMTP_PASS, SMTP_FROM/,
  );
});

test("production builds do not require runtime SMTP secrets", () => {
  assert.deepEqual(
    resolveMailConfiguration({
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
    }),
    {
      mailProvider: "None",
      config: { host: "localhost", port: 25, secure: false },
    },
  );

  assert.throws(
    () =>
      resolveMailConfiguration({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
        SMTP_HOST: "smtp.example.org",
      }),
    /SMTP_USER, SMTP_PASS, SMTP_FROM/,
  );
});

test("SMTP configuration rejects invalid ports and security flags", () => {
  const complete = {
    NODE_ENV: "production",
    SMTP_HOST: "smtp.example.org",
    SMTP_USER: "user",
    SMTP_PASS: "secret",
    SMTP_FROM: "crm@example.org",
  } as const;
  assert.throws(
    () => resolveMailConfiguration({ ...complete, SMTP_PORT: "70000" }),
    /SMTP_PORT/,
  );
  assert.throws(
    () => resolveMailConfiguration({ ...complete, SMTP_SECURE: "yes" }),
    /SMTP_SECURE/,
  );
});

test("development may explicitly run without email", () => {
  assert.deepEqual(resolveMailConfiguration({ NODE_ENV: "development" }), {
    mailProvider: "None",
    config: { host: "localhost", port: 25, secure: false },
  });
});
