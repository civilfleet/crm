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
    if (req.url !== "/v1/events/registrations") {
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
        if (size > 16384) {
          respond(413, { error: "Request too large" });
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const parsed = registrationPayload.safeParse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      if (!parsed.success) {
        respond(400, { error: "Invalid registration fields" });
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
        await js.publish(`seawatch.ratelimit.events.${addressKey}`, "1");
      } catch (error) {
        if (
          error instanceof Error &&
          /maximum messages|message limit|maximum number/i.test(error.message)
        ) {
          res.setHeader("Retry-After", "3600");
          respond(429, { error: "Too many registration attempts" });
          return;
        }
        throw error;
      }
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(parsed.data))
        .digest("hex");
      await js.publish(
        REGISTRATION_SUBJECT,
        JSON.stringify({
          version: 1,
          submissionId: submissionId.data,
          receivedAt: new Date().toISOString(),
          registration: parsed.data,
        }),
        { msgID: `${submissionId.data}:${fingerprint}` },
      );
      respond(202, { submissionId: submissionId.data, status: "received" });
    } catch (error) {
      respond(error instanceof SyntaxError ? 400 : 503, {
        error:
          error instanceof SyntaxError
            ? "Invalid JSON"
            : "Registration intake unavailable. Please retry with the same Idempotency-Key.",
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
