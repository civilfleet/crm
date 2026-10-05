import assert from "node:assert/strict";
import test from "node:test";
import {
  getEmailConnectionTimeouts,
  getEmailProviderTimeoutMs,
} from "./email-timeouts";

test("email timeouts use bounded defaults and accept positive overrides", () => {
  const original = {
    provider: process.env.EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
    connection: process.env.EMAIL_CONNECTION_TIMEOUT_MS,
    greeting: process.env.EMAIL_GREETING_TIMEOUT_MS,
    socket: process.env.EMAIL_SOCKET_TIMEOUT_MS,
  };
  try {
    delete process.env.EMAIL_PROVIDER_REQUEST_TIMEOUT_MS;
    delete process.env.EMAIL_CONNECTION_TIMEOUT_MS;
    delete process.env.EMAIL_GREETING_TIMEOUT_MS;
    delete process.env.EMAIL_SOCKET_TIMEOUT_MS;
    assert.equal(getEmailProviderTimeoutMs(), 30_000);
    assert.deepEqual(getEmailConnectionTimeouts(), {
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    });

    process.env.EMAIL_PROVIDER_REQUEST_TIMEOUT_MS = "1200";
    process.env.EMAIL_CONNECTION_TIMEOUT_MS = "1300";
    process.env.EMAIL_GREETING_TIMEOUT_MS = "1400";
    process.env.EMAIL_SOCKET_TIMEOUT_MS = "1500";
    assert.equal(getEmailProviderTimeoutMs(), 1200);
    assert.deepEqual(getEmailConnectionTimeouts(), {
      connectionTimeout: 1300,
      greetingTimeout: 1400,
      socketTimeout: 1500,
    });

    process.env.EMAIL_PROVIDER_REQUEST_TIMEOUT_MS = "0";
    assert.equal(getEmailProviderTimeoutMs(), 30_000);
  } finally {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("EMAIL_PROVIDER_REQUEST_TIMEOUT_MS", original.provider);
    restore("EMAIL_CONNECTION_TIMEOUT_MS", original.connection);
    restore("EMAIL_GREETING_TIMEOUT_MS", original.greeting);
    restore("EMAIL_SOCKET_TIMEOUT_MS", original.socket);
  }
});
