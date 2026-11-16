import "dotenv/config";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  DiscardPolicy,
  jetstream,
  jetstreamManager,
  RetentionPolicy,
  StorageType,
} from "@nats-io/jetstream";
import { connect } from "@nats-io/transport-node";
import { z } from "zod";
import {
  REGISTRATION_STREAM,
  REGISTRATION_SUBJECT,
  registrationPayload,
} from "../src/lib/public-events/registration";
import {
  FORM_COUNT_CACHE_SECONDS,
  FORM_COUNT_PATH,
  FORM_COUNT_STREAM,
  FORM_COUNT_SUBJECT_PREFIX,
  formCountSubject,
  formCountValue,
} from "../src/lib/public-forms/counts";
import {
  FORM_RATE_LIMIT_STREAM,
  FORM_RATE_LIMIT_SUBJECT_PREFIX,
  FORM_SUBMISSION_FAILURE_STREAM,
  FORM_SUBMISSION_FAILURE_SUBJECT,
  FORM_SUBMISSION_MAX_BYTES,
  FORM_SUBMISSION_MAX_MSG_SIZE,
  FORM_SUBMISSION_PATH,
  FORM_SUBMISSION_STREAM,
  FORM_SUBMISSION_SUBJECT,
  formSubmissionPayload,
} from "../src/lib/public-forms/submission";

// Each public intake route has its own size cap, schema, rate-limit budget and
// stream. The events route values are the original, unchanged behaviour.
const intakeRoutes = {
  "/v1/events/registrations": {
    maxBytes: 16384,
    schema: registrationPayload as z.ZodType,
    rateLimitPrefix: "seawatch.ratelimit.events",
    subject: REGISTRATION_SUBJECT,
    envelopeKey: "registration",
    invalidFields: "Invalid registration fields",
    rateLimited: "Too many registration attempts",
    unavailable:
      "Registration intake unavailable. Please retry with the same Idempotency-Key.",
  },
  [FORM_SUBMISSION_PATH]: {
    maxBytes: FORM_SUBMISSION_MAX_BYTES,
    schema: formSubmissionPayload as z.ZodType,
    rateLimitPrefix: FORM_RATE_LIMIT_SUBJECT_PREFIX,
    subject: FORM_SUBMISSION_SUBJECT,
    envelopeKey: "submission",
    invalidFields: "Invalid form submission fields",
    rateLimited: "Too many form submissions",
    unavailable:
      "Form intake unavailable. Please retry with the same Idempotency-Key.",
  },
} as const;

async function main() {
  const nc = await connect({
    servers: process.env.NATS_URL ?? "nats://127.0.0.1:4222",
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASSWORD,
    name: "seawatch-api",
    inboxPrefix: `_INBOX.${process.env.NATS_USER ?? "api"}`,
    maxReconnectAttempts: -1,
  });
  const js = jetstream(nc);
  const manager = await jetstreamManager(nc);
  if (process.argv.includes("--initialize")) {
    try {
      await manager.streams.info(REGISTRATION_STREAM);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        !["404", "10059"].includes(String(error.code))
      )
        throw error;
      await manager.streams.add({
        name: REGISTRATION_STREAM,
        subjects: [REGISTRATION_SUBJECT],
        storage: StorageType.File,
        retention: RetentionPolicy.Workqueue,
        discard: DiscardPolicy.New,
        max_bytes: 1024 ** 3,
        max_msg_size: 16384,
        max_age: 0,
        duplicate_window: 24 * 60 * 60 * 1e9,
      });
    }
    for (const stream of [
      {
        name: "SEAWATCH_REGISTRATION_FAILURES",
        subjects: ["seawatch.events.registrations.failed.v1"],
        retention: RetentionPolicy.Limits,
        discard: DiscardPolicy.New,
        storage: StorageType.File,
        max_bytes: 1024 ** 3,
        max_age: 0,
      },
      {
        name: "SEAWATCH_REGISTRATION_RATE_LIMIT",
        subjects: ["seawatch.ratelimit.events.*"],
        retention: RetentionPolicy.Limits,
        discard: DiscardPolicy.New,
        storage: StorageType.File,
        max_msgs_per_subject: 10,
        discard_new_per_subject: true,
        max_age: 60 * 60 * 1e9,
        max_bytes: 64 * 1024 ** 2,
      },
      {
        name: FORM_SUBMISSION_STREAM,
        subjects: [FORM_SUBMISSION_SUBJECT],
        storage: StorageType.File,
        retention: RetentionPolicy.Workqueue,
        discard: DiscardPolicy.New,
        max_bytes: 1024 ** 3,
        max_msg_size: FORM_SUBMISSION_MAX_MSG_SIZE,
        max_age: 0,
        duplicate_window: 24 * 60 * 60 * 1e9,
      },
      {
        // JetStream reserves max_bytes up front against the server's
        // max_file_store (4 GB, deploy/seawatch-api/kubernetes/jetstream.yaml);
        // failures are rare, so this stream stays small enough to fit.
        name: FORM_SUBMISSION_FAILURE_STREAM,
        subjects: [FORM_SUBMISSION_FAILURE_SUBJECT],
        retention: RetentionPolicy.Limits,
        discard: DiscardPolicy.New,
        storage: StorageType.File,
        max_bytes: 256 * 1024 ** 2,
        max_age: 0,
      },
      {
        // One subject per form; only its latest count is kept.
        name: FORM_COUNT_STREAM,
        subjects: [`${FORM_COUNT_SUBJECT_PREFIX}.>`],
        retention: RetentionPolicy.Limits,
        discard: DiscardPolicy.Old,
        storage: StorageType.File,
        max_msgs_per_subject: 1,
        max_msg_size: 1024,
        max_bytes: 64 * 1024 ** 2,
        max_age: 0,
      },
      {
        name: FORM_RATE_LIMIT_STREAM,
        subjects: [`${FORM_RATE_LIMIT_SUBJECT_PREFIX}.*`],
        retention: RetentionPolicy.Limits,
        discard: DiscardPolicy.New,
        storage: StorageType.File,
        max_msgs_per_subject: 10,
        discard_new_per_subject: true,
        max_age: 60 * 60 * 1e9,
        max_bytes: 64 * 1024 ** 2,
      },
    ]) {
      try {
        await manager.streams.info(stream.name);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          !["404", "10059"].includes(String(error.code))
        )
          throw error;
        await manager.streams.add(stream);
      }
    }
    await nc.drain();
    return;
  }
  const origins = new Set(
    (process.env.PUBLIC_EVENTS_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!origins.size)
    throw new Error(
      "PUBLIC_EVENTS_ORIGINS must explicitly list allowed frontend origins.",
    );
  let stopping = false;
  // Public form counts, cached per form so a busy page reads NATS at most
  // once a minute; unknown forms are cached too, and the cache is bounded.
  const countCache = new Map<
    string,
    { expires: number; status: number; body: unknown }
  >();
  const readFormCount = async (subject: string) => {
    const cached = countCache.get(subject);
    if (cached && cached.expires > Date.now()) return cached;
    const message = await manager.streams.getMessage(FORM_COUNT_STREAM, {
      last_by_subj: subject,
    });
    const value = message
      ? formCountValue.safeParse(
          JSON.parse(new TextDecoder().decode(message.data)),
        )
      : undefined;
    const entry =
      value?.success && value.data.public
        ? {
            status: 200,
            body: { count: value.data.count, goal: value.data.goal },
          }
        : { status: 404, body: { error: "No public count" } };
    if (countCache.size >= 1000) countCache.clear();
    const stored = {
      ...entry,
      expires: Date.now() + FORM_COUNT_CACHE_SECONDS * 1000,
    };
    countCache.set(subject, stored);
    return stored;
  };
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Expose-Headers", "Retry-After");
    }
    res.setHeader("Vary", "Origin");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const respond = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/healthz") {
      respond(stopping ? 503 : 200, { status: stopping ? "stopping" : "ok" });
      return;
    }
    if (req.url === "/readyz") {
      try {
        if (stopping || nc.isClosed()) throw new Error();
        await nc.flush();
        respond(200, { status: "ready" });
      } catch {
        respond(503, { status: "unavailable" });
      }
      return;
    }
    const url = new URL(req.url ?? "/", "http://bridge.invalid");
    if (url.pathname === FORM_COUNT_PATH) {
      if (origin && !origins.has(origin)) {
        respond(403, { error: "Origin not allowed" });
        return;
      }
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        respond(405, { error: "Method not allowed" });
        return;
      }
      const teamId = z.uuid().safeParse(url.searchParams.get("team"));
      const subject = teamId.success
        ? formCountSubject(teamId.data, url.searchParams.get("form") ?? "")
        : null;
      if (!subject) {
        respond(400, { error: "A team UUID and a form id are required" });
        return;
      }
      try {
        const count = await readFormCount(subject);
        res.setHeader(
          "Cache-Control",
          `public, max-age=${FORM_COUNT_CACHE_SECONDS}`,
        );
        respond(count.status, count.body);
      } catch {
        respond(503, { error: "Form counts unavailable" });
      }
      return;
    }
    const route = Object.hasOwn(intakeRoutes, req.url ?? "")
      ? intakeRoutes[req.url as keyof typeof intakeRoutes]
      : undefined;
    if (!route) {
      respond(404, { error: "Not found" });
      return;
    }
    if (origin && !origins.has(origin)) {
      respond(403, { error: "Origin not allowed" });
      return;
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Idempotency-Key",
      );
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      respond(405, { error: "Method not allowed" });
      return;
    }
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      respond(415, { error: "JSON required" });
      return;
    }
    const submissionId = z.uuid().safeParse(req.headers["idempotency-key"]);
    if (!submissionId.success) {
      respond(400, { error: "A UUID Idempotency-Key is required" });
      return;
    }
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > route.maxBytes) {
          respond(413, { error: "Request too large" });
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const parsed = route.schema.safeParse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      if (!parsed.success) {
        respond(400, { error: route.invalidFields });
        return;
      }
      // Traefik appends the actual peer to X-Forwarded-For. NetworkPolicy
      // restricts this service to Traefik, so direct clients cannot forge it.
      const forwarded = req.headers["x-forwarded-for"];
      const ip =
        typeof forwarded === "string"
          ? forwarded.split(",").at(-1)?.trim()
          : req.socket.remoteAddress;
      if (!process.env.RATE_LIMIT_HASH_KEY)
        throw new Error("Rate limit key not configured");
      const addressKey = createHash("sha256")
        .update(`${process.env.RATE_LIMIT_HASH_KEY}:${ip}`)
        .digest("hex");
      try {
        await js.publish(`${route.rateLimitPrefix}.${addressKey}`, "1");
      } catch (error) {
        if (
          error instanceof Error &&
          /maximum messages|message limit|maximum number/i.test(error.message)
        ) {
          res.setHeader("Retry-After", "3600");
          respond(429, { error: route.rateLimited });
          return;
        }
        throw error;
      }
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(parsed.data))
        .digest("hex");
      await js.publish(
        route.subject,
        JSON.stringify({
          version: 1,
          submissionId: submissionId.data,
          receivedAt: new Date().toISOString(),
          [route.envelopeKey]: parsed.data,
        }),
        { msgID: `${submissionId.data}:${fingerprint}` },
      );
      respond(202, { submissionId: submissionId.data, status: "received" });
    } catch (error) {
      respond(error instanceof SyntaxError ? 400 : 503, {
        error:
          error instanceof SyntaxError ? "Invalid JSON" : route.unavailable,
      });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(Number(process.env.PORT ?? 8080), "::", () =>
    console.log("Sea-Watch API listening"),
  );
  const stop = () => {
    stopping = true;
    server.close(() => {
      nc.drain().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 25000).unref();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
main().catch(() => {
  console.error(
    "Public API failed to start; check broker connectivity and configuration.",
  );
  process.exit(1);
});
