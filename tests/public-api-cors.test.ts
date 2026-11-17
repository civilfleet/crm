import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import {
  REGISTRATION_STREAM,
  REGISTRATION_SUBJECT,
  registrationPayload,
} from "../src/lib/public-events/registration";
import * as publicCaptcha from "../src/lib/public-forms/captcha";
import * as publicConfirmation from "../src/lib/public-forms/confirmation";
import * as publicCounts from "../src/lib/public-forms/counts";
import * as publicForms from "../src/lib/public-forms/submission";
import { loadModule } from "./helpers/load-module";

const allowedOrigins = [
  "https://seawatch-events.netlify.app",
  "https://sea-watch.org",
  "https://dev-bridge-integration--seawatch.netlify.app",
  "https://staging--seawatch.netlify.app",
];
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

test("bridge exact-origin CORS covers preflight and all registration error paths", async (t) => {
  const savedOrigins = process.env.PUBLIC_EVENTS_ORIGINS;
  const savedKey = process.env.RATE_LIMIT_HASH_KEY;
  const signals = ["SIGTERM", "SIGINT"] as const;
  const before = signals.map((signal) => new Set(process.listeners(signal)));
  process.env.PUBLIC_EVENTS_ORIGINS = allowedOrigins.join(",");
  process.env.RATE_LIMIT_HASH_KEY = "local-test-only";
  let publishFailure: string | undefined;
  let publishes = 0;
  let capture: (handler: Handler) => void = () => {};
  const started = new Promise<Handler>((resolve) => {
    capture = resolve;
  });
  try {
    // Execute the real entrypoint with HTTP and NATS replaced at their boundaries.
    // No sockets, credentials, production data or registration API calls are used.
    loadModule("scripts/public-api.ts", {
      "dotenv/config": {},
      "../src/lib/public-events/registration": {
        registrationPayload,
        REGISTRATION_STREAM,
        REGISTRATION_SUBJECT,
      },
      "../src/lib/public-forms/submission": publicForms,
      "../src/lib/public-forms/counts": publicCounts,
      "../src/lib/public-forms/confirmation": publicConfirmation,
      "../src/lib/public-forms/captcha": publicCaptcha,
      "node:http": {
        createServer: (handler: Handler) => {
          capture(handler);
          return { listen: () => {}, close: () => {} };
        },
      },
      "@nats-io/transport-node": {
        connect: async () => ({
          isClosed: () => false,
          flush: async () => {},
          drain: async () => {},
        }),
      },
      "@nats-io/jetstream": {
        jetstream: () => ({
          publish: async () => {
            publishes++;
            if (publishFailure) throw new Error(publishFailure);
          },
        }),
        jetstreamManager: async () => ({}),
      },
    });
    const handler = await started;
    const send = async (options: {
      origin: string;
      method?: string;
      contentType?: string;
      key?: string;
      body?: string;
    }) => {
      const req = Readable.from([
        Buffer.from(options.body ?? "{}"),
      ]) as IncomingMessage;
      req.url = "/v1/events/registrations";
      req.method = options.method ?? "POST";
      req.headers = {
        origin: options.origin,
        "content-type": options.contentType ?? "application/json",
        "idempotency-key":
          options.key ?? "11111111-1111-4111-8111-111111111111",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,idempotency-key",
      };
      Object.defineProperty(req, "socket", {
        value: { remoteAddress: "127.0.0.1" },
      });
      const headers = new Map<string, string>();
      let status = 0,
        body = "";
      const response = {
        setHeader(name: string, value: string) {
          headers.set(name.toLowerCase(), value);
        },
        writeHead(code: number, extra?: Record<string, string>) {
          status = code;
          for (const [name, value] of Object.entries(extra ?? {}))
            headers.set(name.toLowerCase(), value);
        },
        end(value?: string) {
          body = value ?? "";
        },
      } as unknown as ServerResponse;
      await handler(req, response);
      return { status, headers, body };
    };
    const assertCors = (
      result: Awaited<ReturnType<typeof send>>,
      origin: string,
    ) => {
      assert.equal(result.headers.get("access-control-allow-origin"), origin);
      assert.equal(result.headers.get("vary"), "Origin");
      assert.equal(
        result.headers.get("access-control-expose-headers"),
        "Retry-After",
      );
      assert.ok(!result.headers.has("access-control-allow-credentials"));
      assert.ok(!result.headers.has("set-cookie"));
    };
    await t.test(
      "each approved preflight allows POST and required headers without touching NATS",
      async () => {
        for (const origin of allowedOrigins) {
          const result = await send({ origin, method: "OPTIONS" });
          assert.equal(result.status, 204);
          assert.equal(result.body, "");
          assertCors(result, origin);
          assert.ok(
            result.headers
              .get("access-control-allow-methods")
              ?.split(/,\s*/)
              .includes("POST"),
          );
          assert.deepEqual(
            result.headers
              .get("access-control-allow-headers")
              ?.toLowerCase()
              .split(/,\s*/),
            ["content-type", "idempotency-key", "x-altcha"],
          );
        }
        assert.equal(publishes, 0);
      },
    );
    await t.test(
      "other aliases, www, lookalikes and null origins remain rejected",
      async () => {
        for (const origin of [
          "https://attacker.example",
          "https://other--seawatch.netlify.app",
          "https://www.sea-watch.org",
          "https://sea-watch.org.attacker.example",
          "https://sea-watch.org:444",
          "null",
        ]) {
          for (const method of ["OPTIONS", "POST"]) {
            const result = await send({ origin, method });
            assert.equal(result.status, 403);
            assert.equal(result.headers.get("vary"), "Origin");
            assert.ok(!result.headers.has("access-control-allow-origin"));
            assert.ok(!result.headers.has("access-control-allow-headers"));
            assert.ok(!result.headers.has("access-control-expose-headers"));
          }
        }
        assert.equal(publishes, 0);
      },
    );
    const payload = JSON.stringify({
      eventId: "22222222-2222-4222-8222-222222222222",
      name: "Synthetic CORS test",
      email: "cors@example.invalid",
    });
    for (const origin of allowedOrigins) {
      await t.test(
        `validation, rate limit and broker errors retain CORS for ${origin}`,
        async () => {
          for (const [options, expected] of [
            [{ key: "not-a-uuid" }, 400],
            [{ body: "{" }, 400],
            [{ body: "{}" }, 400],
            [{ contentType: "text/plain" }, 415],
            [{ body: "x".repeat(16385) }, 413],
          ] as const) {
            const result = await send({ origin, ...options });
            assert.equal(result.status, expected);
            assertCors(result, origin);
          }
          publishFailure = "maximum messages per subject exceeded";
          const limited = await send({ origin, body: payload });
          assert.equal(limited.status, 429);
          assert.equal(limited.headers.get("retry-after"), "3600");
          assertCors(limited, origin);
          publishFailure = "broker unavailable";
          const unavailable = await send({ origin, body: payload });
          assert.equal(unavailable.status, 503);
          assertCors(unavailable, origin);
          publishFailure = undefined;
        },
      );
    }
  } finally {
    if (savedOrigins === undefined) delete process.env.PUBLIC_EVENTS_ORIGINS;
    else process.env.PUBLIC_EVENTS_ORIGINS = savedOrigins;
    if (savedKey === undefined) delete process.env.RATE_LIMIT_HASH_KEY;
    else process.env.RATE_LIMIT_HASH_KEY = savedKey;
    signals.forEach((signal, index) => {
      for (const listener of process.listeners(signal))
        if (!before[index].has(listener))
          process.removeListener(signal, listener);
    });
  }
});

test("durable deployment allowlist preserves the previous origin and includes only approved website origins", async () => {
  const yaml = await readFile(
    "deploy/seawatch-api/kubernetes/api.yaml",
    "utf8",
  );
  const value = /name: PUBLIC_EVENTS_ORIGINS\s+value: "([^"]+)"/.exec(
    yaml,
  )?.[1];
  assert.ok(value);
  assert.deepEqual(value.split(","), allowedOrigins);
  assert.ok(!value.includes("*"));
});
