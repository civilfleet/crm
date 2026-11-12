import "dotenv/config";
import { jetstream, jetstreamManager } from "@nats-io/jetstream";
import { connect, wsconnect } from "@nats-io/transport-node";
import prisma from "../src/lib/prisma";
import { consumerErrorCodes } from "../src/lib/public-events/consumer-errors";
import {
  type IntakeJetStream,
  type IntakeManager,
  runIntakePipelines,
} from "../src/lib/public-intake/consumer";
import { intakePipelines } from "../src/lib/public-intake/pipelines";

// Public intake consumer: event registrations and website form submissions on
// one NATS connection (user crm). See src/lib/public-intake/consumer.ts.
let phase = "configuration";

async function main() {
  const server = process.env.NATS_URL;
  if (!server || !process.env.NATS_USER || !process.env.NATS_PASSWORD)
    throw new Error("NATS_URL, NATS_USER and NATS_PASSWORD are required.");
  const options = {
    servers: server,
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASSWORD,
    name: "crm-public-intake",
    inboxPrefix: "_INBOX.crm",
    maxReconnectAttempts: -1,
  };
  phase = "NATS connection";
  const nc = await (/^wss?:/.test(server)
    ? wsconnect(options)
    : connect(options));
  phase = "JetStream access";
  const js = jetstream(nc);
  const manager = await jetstreamManager(nc);

  let stopping = false;
  const callbacks: Array<() => void> = [];
  let resolveStopped: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const callback of callbacks) callback();
    resolveStopped();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  phase = "pipelines";
  try {
    await runIntakePipelines(
      {
        js: js as unknown as IntakeJetStream,
        manager: manager as unknown as IntakeManager,
        logger: console,
        stopped,
        isStopping: () => stopping,
        onStop: (callback) => {
          if (stopping) callback();
          else callbacks.push(callback);
        },
      },
      intakePipelines,
    );
  } finally {
    await nc.drain();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    "Public intake consumer stopped; queued messages remain in JetStream.",
    JSON.stringify({ phase, errors: consumerErrorCodes(error) }),
  );
  process.exit(1);
});
