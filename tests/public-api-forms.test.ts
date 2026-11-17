import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import * as publicEvents from "../src/lib/public-events/registration";
import * as publicCaptcha from "../src/lib/public-forms/captcha";
import * as publicConfirmation from "../src/lib/public-forms/confirmation";
import * as publicCounts from "../src/lib/public-forms/counts";
import * as publicForms from "../src/lib/public-forms/submission";
import { loadModule } from "./helpers/load-module";

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
type Publish = { subject: string; data: string; msgID?: string };

const ORIGIN = "https://sea-watch.org";
const KEY = "33333333-3333-4333-8333-333333333333";
const CONFIRMATION_KEY = "confirmation-test-only";

const formBody = (answer = "Synthetic") => ({
  version: 1,
  teamId: "a10957f3-9d42-4b67-b31c-8bed001777ff",
  form: {
    id: "form-document",
    title: "Volunteer interest",
    revision: "2026-11-10T09:00:00.000Z",
    locale: "en",
  },
  page: "/en/get-involved",
  submittedAt: "2026-11-12T10:00:00.000Z",
  contact: { email: "Forms@Example.Invalid" },
  answers: [{ id: "why", label: "Why?", type: "textarea", value: answer }],
});

async function startBridge(
  t: { after: (fn: () => void) => void },
  options: {
    streams?: Array<Record<string, unknown>>;
    env?: Record<string, string>;
  } = {},
) {
  const saved = {
    origins: process.env.PUBLIC_EVENTS_ORIGINS,
    key: process.env.RATE_LIMIT_HASH_KEY,
  };
  const signals = ["SIGTERM", "SIGINT"] as const;
  const before = signals.map((signal) => new Set(process.listeners(signal)));
  process.env.PUBLIC_EVENTS_ORIGINS = ORIGIN;
  process.env.RATE_LIMIT_HASH_KEY = "local-test-only";
  for (const [name, value] of Object.entries(options.env ?? {})) {
    const saved = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (saved === undefined) delete process.env[name];
      else process.env[name] = saved;
    });
  }
  const savedConfirmationKey = process.env.FORM_CONFIRMATION_KEY;
  process.env.FORM_CONFIRMATION_KEY = CONFIRMATION_KEY;
  t.after(() => {
    if (savedConfirmationKey === undefined)
      delete process.env.FORM_CONFIRMATION_KEY;
    else process.env.FORM_CONFIRMATION_KEY = savedConfirmationKey;
  });
  t.after(() => {
    if (saved.origins === undefined) delete process.env.PUBLIC_EVENTS_ORIGINS;
    else process.env.PUBLIC_EVENTS_ORIGINS = saved.origins;
    if (saved.key === undefined) delete process.env.RATE_LIMIT_HASH_KEY;
    else process.env.RATE_LIMIT_HASH_KEY = saved.key;
    signals.forEach((signal, index) => {
      for (const listener of process.listeners(signal))
        if (!before[index].has(listener))
          process.removeListener(signal, listener);
    });
  });
  const publishes: Publish[] = [];
  const failures = new Map<string, string>();
  // Last message per subject of the form counts stream.
  const counts = new Map<string, string>();
  const countReads: string[] = [];
  let capture: (handler: Handler) => void = () => {};
  const started = new Promise<Handler>((resolve) => {
    capture = resolve;
  });
  // Real entrypoint; HTTP and NATS are replaced at their boundaries.
  loadModule("scripts/public-api.ts", {
    "dotenv/config": {},
    "../src/lib/public-events/registration": publicEvents,
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
      DiscardPolicy: {},
      RetentionPolicy: {},
      StorageType: {},
      jetstream: () => ({
        publish: async (
          subject: string,
          data: string,
          opts?: { msgID?: string },
        ) => {
          for (const [prefix, message] of failures)
            if (subject.startsWith(prefix)) throw new Error(message);
          // JetStream reports a message id it has seen as a duplicate.
          const duplicate = publishes.some(
            (sent) =>
              sent.subject === subject &&
              opts?.msgID !== undefined &&
              sent.msgID === opts.msgID,
          );
          publishes.push({ subject, data, msgID: opts?.msgID });
          return { duplicate };
        },
      }),
      jetstreamManager: async () => ({
        streams: {
          info: async () => {
            throw Object.assign(new Error("not found"), { code: "10059" });
          },
          add: async (stream: Record<string, unknown>) => {
            options.streams?.push(stream);
          },
          getMessage: async (
            stream: string,
            query: { last_by_subj: string },
          ) => {
            assert.equal(stream, "SEAWATCH_FORM_COUNTS");
            countReads.push(query.last_by_subj);
            const data = counts.get(query.last_by_subj);
            if (data === "fail") throw new Error("broker down");
            return data === undefined
              ? null
              : { data: new TextEncoder().encode(data) };
          },
        },
      }),
    },
  });
  const handler = await started;
  const send = async (request: {
    url: string;
    method?: string;
    key?: string | null;
    contentType?: string;
    body?: string;
    captcha?: string;
  }) => {
    const req = Readable.from([
      Buffer.from(request.body ?? "{}"),
    ]) as IncomingMessage;
    req.url = request.url;
    req.method = request.method ?? "POST";
    req.headers = {
      ...(request.captcha ? { "x-altcha": request.captcha } : {}),
      origin: ORIGIN,
      "content-type": request.contentType ?? "application/json",
      "x-forwarded-for": "203.0.113.7",
    };
    if (request.key !== null)
      req.headers["idempotency-key"] = request.key ?? KEY;
    Object.defineProperty(req, "socket", {
      value: { remoteAddress: "127.0.0.1" },
    });
    const headers = new Map<string, string>();
    let status = 0;
    let body = "";
    await handler(req, {
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
    } as unknown as ServerResponse);
    return { status, headers, body };
  };
  return { send, publishes, failures, counts, countReads };
}

test("forms route queues a valid submission on its own subject and rate-limit budget", async (t) => {
  const bridge = await startBridge(t);
  const result = await bridge.send({
    url: "/v1/forms/submissions",
    body: JSON.stringify(formBody()),
  });
  assert.equal(result.status, 202);
  assert.deepEqual(JSON.parse(result.body), {
    submissionId: KEY,
    status: "received",
  });
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(bridge.publishes.length, 2);
  const [limit, queued] = bridge.publishes;
  assert.match(limit.subject, /^seawatch\.ratelimit\.forms\.[a-f0-9]{64}$/);
  assert.equal(queued.subject, "seawatch.forms.submissions.v1");
  const envelope = JSON.parse(queued.data);
  assert.deepEqual(Object.keys(envelope), [
    "version",
    "submissionId",
    "receivedAt",
    "submission",
  ]);
  assert.equal(envelope.submission.contact.email, "forms@example.invalid");
  assert.ok(publicForms.formSubmissionMessage.safeParse(envelope).success);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(envelope.submission))
    .digest("hex");
  assert.equal(queued.msgID, `${KEY}:${fingerprint}`);
});

test("forms route status codes: preflight, 400, 405, 413, 415, 429, 503", async (t) => {
  const bridge = await startBridge(t);
  const url = "/v1/forms/submissions";
  const preflight = await bridge.send({ url, method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-headers"),
    "Content-Type, Idempotency-Key, X-Altcha",
  );
  assert.equal((await bridge.send({ url, method: "GET" })).status, 405);
  assert.equal(
    (await bridge.send({ url, contentType: "text/plain" })).status,
    415,
  );
  const body = JSON.stringify(formBody());
  const missingKey = await bridge.send({ url, key: null, body });
  assert.equal(missingKey.status, 400);
  assert.match(missingKey.body, /Idempotency-Key/);
  assert.equal((await bridge.send({ url, key: "nope", body })).status, 400);
  assert.equal((await bridge.send({ url, body: "{" })).status, 400);
  const invalid = await bridge.send({ url, body: "{}" });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body, /Invalid form submission fields/);
  // Larger than the events cap but within the 64 KiB forms cap is accepted
  // size-wise; anything over 65536 bytes is rejected before parsing.
  const large = JSON.stringify({
    ...formBody(),
    answers: ["a", "b", "c"].map((id) => ({
      id,
      label: id,
      type: "textarea",
      value: "x".repeat(10000),
    })),
  });
  assert.ok(large.length > 16384 && large.length < 65536);
  assert.equal((await bridge.send({ url, body: large })).status, 202);
  const padded = JSON.stringify({ ...formBody(), pad: "x".repeat(20000) });
  assert.ok(padded.length > 16384 && padded.length < 65536);
  assert.equal((await bridge.send({ url, body: padded })).status, 400);
  const tooLarge = await bridge.send({ url, body: "x".repeat(65537) });
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLarge.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(
    (await bridge.send({ url, body: `${" ".repeat(65536 - 2)}{}` })).status,
    400,
  );
  bridge.failures.set(
    "seawatch.ratelimit.forms.",
    "maximum messages per subject exceeded",
  );
  const limited = await bridge.send({ url, body });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "3600");
  assert.match(limited.body, /Too many form submissions/);
  bridge.failures.clear();
  bridge.failures.set("seawatch.forms.", "broker unavailable");
  const unavailable = await bridge.send({ url, body });
  assert.equal(unavailable.status, 503);
  assert.match(unavailable.body, /same Idempotency-Key/);
  assert.equal((await bridge.send({ url: `${url}/`, body })).status, 404);
  assert.equal((await bridge.send({ url: `${url}?x=1`, body })).status, 404);
});

const TEAM = "a10957f3-9d42-4b67-b31c-8bed001777ff";
const countUrl = (form = "petition-1", team = TEAM) =>
  `/v1/forms/count?team=${team}&form=${form}`;

test("count route serves a public count with its goal, cached", async (t) => {
  const bridge = await startBridge(t);
  const subject = `seawatch.forms.counts.v1.${TEAM}.petition-1`;
  bridge.counts.set(
    subject,
    JSON.stringify({ public: true, count: 2341, goal: 5000 }),
  );

  const first = await bridge.send({ url: countUrl(), method: "GET" });
  assert.equal(first.status, 200);
  assert.deepEqual(JSON.parse(first.body), { count: 2341, goal: 5000 });
  assert.equal(first.headers.get("cache-control"), "public, max-age=60");
  assert.equal(first.headers.get("access-control-allow-origin"), ORIGIN);

  // A newer count is served once the cached one expires, not before.
  bridge.counts.set(
    subject,
    JSON.stringify({ public: true, count: 2342, goal: 5000 }),
  );
  const second = await bridge.send({ url: countUrl(), method: "GET" });
  assert.equal(JSON.parse(second.body).count, 2341);
  assert.equal(bridge.countReads.length, 1);
  // Counting needs no publish: nothing is queued or rate-limited.
  assert.equal(bridge.publishes.length, 0);
});

test("count route: 404 when not public or unknown, 400, 405, 503", async (t) => {
  const bridge = await startBridge(t);
  bridge.counts.set(
    `seawatch.forms.counts.v1.${TEAM}.hidden`,
    JSON.stringify({ public: false }),
  );
  bridge.counts.set(`seawatch.forms.counts.v1.${TEAM}.broken`, "fail");
  const get = (url: string) => bridge.send({ url, method: "GET" });

  assert.equal((await get(countUrl("hidden"))).status, 404);
  assert.equal((await get(countUrl("never-sent"))).status, 404);
  assert.equal((await get(countUrl("a.b"))).status, 400);
  assert.equal((await get(countUrl("x", "not-a-uuid"))).status, 400);
  assert.equal((await get("/v1/forms/count")).status, 400);
  assert.equal((await get(countUrl("broken"))).status, 503);
  const post = await bridge.send({ url: countUrl(), method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, OPTIONS");
  const preflight = await bridge.send({ url: countUrl(), method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-methods"),
    "GET, OPTIONS",
  );
});

test("the CRM publishes counts only when they change", async () => {
  const sent: Array<{ subject: string; data: string }> = [];
  const js = {
    publish: async (subject: string, data: string) => {
      sent.push({ subject, data });
    },
  };
  const published = new Map<string, string>();
  const row = {
    teamId: TEAM,
    formId: "petition-1",
    publicCount: true,
    goal: 5000,
    count: 12,
  };
  const odd = { ...row, formId: "has.dot", count: 3 };

  assert.equal(
    await publicCounts.publishFormCounts(js, [row, odd], published),
    1,
  );
  assert.deepEqual(sent, [
    {
      subject: `seawatch.forms.counts.v1.${TEAM}.petition-1`,
      data: JSON.stringify({ public: true, count: 12, goal: 5000 }),
    },
  ]);
  assert.equal(await publicCounts.publishFormCounts(js, [row], published), 0);
  await publicCounts.publishFormCounts(
    js,
    [{ ...row, publicCount: false }],
    published,
  );
  assert.equal(sent.at(-1)?.data, JSON.stringify({ public: false }));
});

test("confirmation route queues a validly signed confirmation once", async (t) => {
  const bridge = await startBridge(t);
  const submissionId = "44444444-4444-4444-8444-444444444444";
  const token = publicConfirmation.createConfirmationToken(
    submissionId,
    CONFIRMATION_KEY,
  );
  const result = await bridge.send({
    url: "/v1/forms/confirmations",
    key: null,
    body: JSON.stringify({ token }),
  });
  assert.equal(result.status, 202);
  assert.deepEqual(JSON.parse(result.body), { status: "confirmed" });
  const [limit, queued] = bridge.publishes;
  assert.match(limit.subject, /^seawatch\.ratelimit\.forms\.[a-f0-9]{64}$/);
  assert.equal(queued.subject, "seawatch.forms.confirmations.v1");
  assert.equal(queued.msgID, `confirm:${submissionId}`);
  const message = JSON.parse(queued.data);
  assert.equal(message.submissionId, submissionId);
  assert.ok(
    publicConfirmation.formConfirmationMessage.safeParse(message).success,
  );
});

test("confirmation route refuses forged tokens and bad requests", async (t) => {
  const bridge = await startBridge(t);
  const url = "/v1/forms/confirmations";
  const send = (body: unknown, extra = {}) =>
    bridge.send({ url, key: null, body: JSON.stringify(body), ...extra });
  const forged = publicConfirmation.createConfirmationToken(
    "44444444-4444-4444-8444-444444444444",
    "someone else's key",
  );
  assert.equal((await send({ token: forged })).status, 400);
  assert.equal((await send({ token: "nonsense" })).status, 400);
  assert.equal((await send({ token: "x", extra: 1 })).status, 400);
  assert.equal((await send({}, { contentType: "text/plain" })).status, 415);
  assert.equal(
    (await bridge.send({ url, key: null, body: "x".repeat(2000) })).status,
    413,
  );
  assert.equal((await bridge.send({ url, method: "GET" })).status, 405);
  const preflight = await bridge.send({ url, method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-headers"),
    "Content-Type",
  );
  assert.equal(bridge.publishes.length, 0, "nothing queued or counted");
});

const CAPTCHA_ENV = {
  CAPTCHA_MODE_FORMS: "required",
  CAPTCHA_KEY: "captcha-test-only",
  // Cheap enough to solve in a test.
  CAPTCHA_COST: "10",
  CAPTCHA_MIN_COUNTER: "5",
  CAPTCHA_MAX_COUNTER: "20",
};

test("with the captcha required, a solved puzzle lets one submission through", async (t) => {
  const bridge = await startBridge(t, { env: CAPTCHA_ENV });
  const challengeResponse = await bridge.send({
    url: "/v1/forms/challenge",
    method: "GET",
  });
  assert.equal(challengeResponse.status, 200);
  assert.equal(challengeResponse.headers.get("cache-control"), "no-store");
  const challenge = JSON.parse(challengeResponse.body);
  assert.equal(challenge.parameters.algorithm, "PBKDF2/SHA-256");
  const solution = await solveChallenge({ challenge, deriveKey });
  const captcha = Buffer.from(JSON.stringify({ challenge, solution })).toString(
    "base64",
  );
  const url = "/v1/forms/submissions";
  const body = JSON.stringify(formBody());

  const missing = await bridge.send({ url, body });
  assert.equal(missing.status, 400);
  assert.equal(JSON.parse(missing.body).reason, "missing");

  const first = await bridge.send({ url, body, captcha });
  assert.equal(first.status, 202);
  assert.ok(
    bridge.publishes.some(
      (sent) =>
        sent.subject === "seawatch.captcha.used" &&
        sent.msgID === challenge.signature,
    ),
  );

  // The same solved puzzle again, even with a new submission id.
  const again = await bridge.send({
    url,
    body,
    captcha,
    key: "55555555-5555-4555-8555-555555555555",
  });
  assert.equal(again.status, 400);
  assert.equal(JSON.parse(again.body).reason, "used");
  assert.equal(
    bridge.publishes.filter(
      (sent) => sent.subject === "seawatch.forms.submissions.v1",
    ).length,
    1,
  );

  const preflight = await bridge.send({ url, method: "OPTIONS" });
  assert.equal(
    preflight.headers.get("access-control-allow-headers"),
    "Content-Type, Idempotency-Key, X-Altcha",
  );
});

test("event registrations have their own captcha switch", async (t) => {
  const bridge = await startBridge(t, {
    env: {
      ...CAPTCHA_ENV,
      CAPTCHA_MODE_FORMS: "off",
      CAPTCHA_MODE_EVENTS: "required",
    },
  });
  // The general puzzle path.
  const challenge = JSON.parse(
    (await bridge.send({ url: "/v1/challenge", method: "GET" })).body,
  );
  const solution = await solveChallenge({ challenge, deriveKey });
  const captcha = Buffer.from(JSON.stringify({ challenge, solution })).toString(
    "base64",
  );
  const url = "/v1/events/registrations";
  const body = JSON.stringify({
    eventId: "22222222-2222-4222-8222-222222222222",
    name: "Synthetic",
    email: "events@example.invalid",
  });

  const missing = await bridge.send({ url, body });
  assert.equal(missing.status, 400);
  assert.equal(JSON.parse(missing.body).reason, "missing");
  assert.equal((await bridge.send({ url, body, captcha })).status, 202);
  // Forms are still off here: no captcha needed.
  assert.equal(
    (
      await bridge.send({
        url: "/v1/forms/submissions",
        body: JSON.stringify(formBody()),
        key: "66666666-6666-4666-8666-666666666666",
      })
    ).status,
    202,
  );
});

test("with the captcha off, no challenge and no check", async (t) => {
  const bridge = await startBridge(t);
  assert.equal(
    (await bridge.send({ url: "/v1/forms/challenge", method: "GET" })).status,
    404,
  );
  const result = await bridge.send({
    url: "/v1/forms/submissions",
    body: JSON.stringify(formBody()),
    captcha: "anything",
  });
  assert.equal(result.status, 202);
});

test("events route is unaffected by the forms route", async (t) => {
  const bridge = await startBridge(t);
  const url = "/v1/events/registrations";
  const registration = {
    eventId: "22222222-2222-4222-8222-222222222222",
    name: "Synthetic",
    email: "events@example.invalid",
  };
  const accepted = await bridge.send({
    url,
    body: JSON.stringify(registration),
  });
  assert.equal(accepted.status, 202);
  const [limit, queued] = bridge.publishes;
  assert.match(limit.subject, /^seawatch\.ratelimit\.events\.[a-f0-9]{64}$/);
  assert.equal(queued.subject, "seawatch.events.registrations.v1");
  const envelope = JSON.parse(queued.data);
  assert.deepEqual(Object.keys(envelope), [
    "version",
    "submissionId",
    "receivedAt",
    "registration",
  ]);
  assert.deepEqual(envelope.registration, registration);
  // The events cap is still 16 KiB, and a form body is not a registration.
  assert.equal(
    (await bridge.send({ url, body: "x".repeat(16385) })).status,
    413,
  );
  const invalid = await bridge.send({ url, body: JSON.stringify(formBody()) });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body, /Invalid registration fields/);
  // A forms rate-limit exhaustion does not consume the events budget.
  bridge.failures.set(
    "seawatch.ratelimit.forms.",
    "maximum messages per subject exceeded",
  );
  assert.equal(
    (await bridge.send({ url, body: JSON.stringify(registration) })).status,
    202,
  );
  bridge.failures.clear();
  bridge.failures.set(
    "seawatch.ratelimit.events.",
    "maximum messages per subject exceeded",
  );
  const limited = await bridge.send({
    url,
    body: JSON.stringify(registration),
  });
  assert.equal(limited.status, 429);
  assert.match(limited.body, /Too many registration attempts/);
});

test("--initialize creates the form streams per contract", async (t) => {
  const streams: Array<Record<string, unknown>> = [];
  const argv = process.argv;
  process.argv = [...argv, "--initialize"];
  t.after(() => {
    process.argv = argv;
  });
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const saved = process.env.PUBLIC_EVENTS_ORIGINS;
  t.after(() => {
    if (saved === undefined) delete process.env.PUBLIC_EVENTS_ORIGINS;
    else process.env.PUBLIC_EVENTS_ORIGINS = saved;
  });
  loadModule("scripts/public-api.ts", {
    "dotenv/config": {},
    "../src/lib/public-events/registration": publicEvents,
    "../src/lib/public-forms/submission": publicForms,
    "../src/lib/public-forms/counts": publicCounts,
    "../src/lib/public-forms/confirmation": publicConfirmation,
    "../src/lib/public-forms/captcha": publicCaptcha,
    "node:http": { createServer: () => ({ listen: () => {} }) },
    "@nats-io/transport-node": {
      connect: async () => ({ drain: async () => resolveDone() }),
    },
    "@nats-io/jetstream": {
      DiscardPolicy: { New: "new", Old: "old" },
      RetentionPolicy: { Workqueue: "workqueue", Limits: "limits" },
      StorageType: { File: "file" },
      jetstream: () => ({}),
      jetstreamManager: async () => ({
        streams: {
          info: async () => {
            throw Object.assign(new Error("not found"), { code: "10059" });
          },
          add: async (stream: Record<string, unknown>) => {
            streams.push(stream);
          },
        },
      }),
    },
  });
  await done;
  const byName = new Map(streams.map((stream) => [stream.name, stream]));
  assert.ok(byName.has("SEAWATCH_EVENT_REGISTRATIONS"));
  assert.deepEqual(byName.get("SEAWATCH_FORM_SUBMISSIONS"), {
    name: "SEAWATCH_FORM_SUBMISSIONS",
    subjects: ["seawatch.forms.submissions.v1"],
    storage: "file",
    retention: "workqueue",
    discard: "new",
    max_bytes: 1024 ** 3,
    max_msg_size: 98304,
    max_age: 0,
    duplicate_window: 24 * 60 * 60 * 1e9,
  });
  assert.deepEqual(byName.get("SEAWATCH_FORM_SUBMISSION_FAILURES")?.subjects, [
    "seawatch.forms.submissions.failed.v1",
  ]);
  assert.equal(
    byName.get("SEAWATCH_FORM_SUBMISSION_FAILURES")?.retention,
    "limits",
  );
  const rate = byName.get("SEAWATCH_FORM_RATE_LIMIT");
  assert.deepEqual(rate?.subjects, ["seawatch.ratelimit.forms.*"]);
  assert.equal(rate?.max_msgs_per_subject, 30);
  assert.equal(
    byName.get("SEAWATCH_REGISTRATION_RATE_LIMIT")?.max_msgs_per_subject,
    30,
  );
  assert.equal(rate?.update, undefined, "the update marker is not sent");
  const used = byName.get("SEAWATCH_CAPTCHA_USED");
  assert.deepEqual(used?.subjects, ["seawatch.captcha.used"]);
  assert.ok(Number(used?.duplicate_window) >= 10 * 60 * 1e9);
  assert.equal(
    byName.get("SEAWATCH_FORM_SUBMISSION_FAILURES")?.max_bytes,
    256 * 1024 ** 2,
  );
  // JetStream reserves every stream's max_bytes against the server's
  // max_file_store; above it, --initialize fails halfway (as on 2026-11-16).
  const conf = await readFile(
    "deploy/seawatch-api/kubernetes/jetstream.yaml",
    "utf8",
  );
  const maxFileStoreGb = Number(/max_file_store:\s*(\d+)GB/.exec(conf)?.[1]);
  assert.ok(maxFileStoreGb > 0, "max_file_store found");
  const reserved = streams.reduce(
    (total, stream) => total + Number(stream.max_bytes ?? 0),
    0,
  );
  assert.ok(
    reserved <= maxFileStoreGb * 1024 ** 3 * 0.9,
    `streams reserve ${reserved} bytes, over 90% of max_file_store`,
  );
  const confirmations = byName.get("SEAWATCH_FORM_CONFIRMATIONS");
  assert.deepEqual(confirmations?.subjects, [
    "seawatch.forms.confirmations.v1",
  ]);
  assert.equal(confirmations?.retention, "workqueue");
  assert.deepEqual(
    byName.get("SEAWATCH_FORM_CONFIRMATION_FAILURES")?.subjects,
    ["seawatch.forms.confirmations.failed.v1"],
  );
  const counts = byName.get("SEAWATCH_FORM_COUNTS");
  assert.deepEqual(counts?.subjects, ["seawatch.forms.counts.v1.>"]);
  assert.equal(counts?.max_msgs_per_subject, 1);
  assert.equal(counts?.discard, "old");
  assert.equal(rate?.discard_new_per_subject, true);
  assert.equal(rate?.max_age, 60 * 60 * 1e9);
});

test("--initialize leaves existing streams, but updates the form rate limit", async (t) => {
  const added: string[] = [];
  const updated: Array<[string, Record<string, unknown>]> = [];
  const argv = process.argv;
  process.argv = [...argv, "--initialize"];
  t.after(() => {
    process.argv = argv;
  });
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  loadModule("scripts/public-api.ts", {
    "dotenv/config": {},
    "../src/lib/public-events/registration": publicEvents,
    "../src/lib/public-forms/submission": publicForms,
    "../src/lib/public-forms/counts": publicCounts,
    "../src/lib/public-forms/confirmation": publicConfirmation,
    "../src/lib/public-forms/captcha": publicCaptcha,
    "node:http": { createServer: () => ({ listen: () => {} }) },
    "@nats-io/transport-node": {
      connect: async () => ({ drain: async () => resolveDone() }),
    },
    "@nats-io/jetstream": {
      DiscardPolicy: { New: "new", Old: "old" },
      RetentionPolicy: { Workqueue: "workqueue", Limits: "limits" },
      StorageType: { File: "file" },
      jetstream: () => ({}),
      jetstreamManager: async () => ({
        streams: {
          info: async () => ({}),
          add: async (stream: { name: string }) => {
            added.push(stream.name);
          },
          update: async (name: string, config: Record<string, unknown>) => {
            updated.push([name, config]);
          },
        },
      }),
    },
  });
  await done;
  assert.deepEqual(added, []);
  assert.deepEqual(updated.map(([name]) => name).sort(), [
    "SEAWATCH_FORM_RATE_LIMIT",
    "SEAWATCH_REGISTRATION_RATE_LIMIT",
  ]);
  for (const [, config] of updated)
    assert.equal(config.max_msgs_per_subject, 30);
});

test("NATS authorization example grants the form subjects and consumer", async () => {
  const conf = await readFile(
    "deploy/seawatch-api/nats-authorization.conf.example",
    "utf8",
  );
  const api = /user: api,[\s\S]*?\} \},/.exec(conf)?.[0] ?? "";
  const crm = /user: crm,[\s\S]*?\} \}/.exec(conf)?.[0] ?? "";
  for (const subject of [
    "seawatch.forms.submissions.v1",
    "seawatch.ratelimit.forms.*",
    "$JS.API.STREAM.MSG.GET.SEAWATCH_FORM_COUNTS",
    "seawatch.forms.confirmations.v1",
    "seawatch.captcha.used",
  ])
    assert.ok(api.includes(`"${subject}"`), subject);
  for (const subject of [
    "$JS.API.STREAM.INFO.SEAWATCH_FORM_SUBMISSIONS",
    "$JS.API.CONSUMER.INFO.SEAWATCH_FORM_SUBMISSIONS.crm-form-submissions-v1",
    "$JS.API.CONSUMER.DURABLE.CREATE.SEAWATCH_FORM_SUBMISSIONS.crm-form-submissions-v1",
    "$JS.API.CONSUMER.MSG.NEXT.SEAWATCH_FORM_SUBMISSIONS.crm-form-submissions-v1",
    "seawatch.forms.submissions.failed.v1",
    "seawatch.forms.counts.v1.>",
    "$JS.API.CONSUMER.MSG.NEXT.SEAWATCH_FORM_CONFIRMATIONS.crm-form-confirmations-v1",
    "seawatch.forms.confirmations.failed.v1",
  ])
    assert.ok(crm.includes(`"${subject}"`), subject);
  assert.ok(!api.includes("seawatch.forms.submissions.failed.v1"));
});
