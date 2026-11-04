import "dotenv/config";
import { connect, wsconnect } from "@nats-io/transport-node";
import { AckPolicy, jetstream, jetstreamManager } from "@nats-io/jetstream";
import { Prisma } from "@prisma/client";
import prisma from "../src/lib/prisma";
import { createEventRegistration } from "../src/services/events";
import {
  registrationMessage,
  REGISTRATION_STREAM,
  REGISTRATION_CONSUMER,
} from "../src/lib/public-events/registration";

async function main() {
  const server = process.env.NATS_URL;
  if (!server || !process.env.NATS_USER || !process.env.NATS_PASSWORD)
    throw new Error("NATS_URL, NATS_USER and NATS_PASSWORD are required.");
  const options = {
    servers: server,
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASSWORD,
    name: "crm-event-registrations",
    inboxPrefix: "_INBOX.crm",
    maxReconnectAttempts: -1,
  };
  const nc = await (/^wss?:/.test(server)
    ? wsconnect(options)
    : connect(options));
  const js = jetstream(nc);
  const manager = await jetstreamManager(nc);
  try {
    await manager.consumers.info(REGISTRATION_STREAM, REGISTRATION_CONSUMER);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      !["404", "10014"].includes(String(error.code))
    )
      throw error;
    await manager.consumers.add(REGISTRATION_STREAM, {
      durable_name: REGISTRATION_CONSUMER,
      ack_policy: AckPolicy.Explicit,
      ack_wait: 60 * 1e9,
      max_ack_pending: 1,
      max_deliver: -1,
    });
  }
  const consumer = await js.consumers.get(
    REGISTRATION_STREAM,
    REGISTRATION_CONSUMER,
  );
  const messages = await consumer.consume({ max_messages: 1 });
  let stopping = false;
  const stop = () => {
    stopping = true;
    messages.stop();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  console.log("CRM event registration consumer started.");
  try {
    for await (const message of messages) {
      if (stopping) break;
      let input: unknown;
      try {
        input = message.json();
      } catch {
        input = null;
      }
      const parsed = registrationMessage.safeParse(input);
      const pulse = setInterval(() => message.working(), 15000);
      try {
        if (!parsed.success) throw new Error("Invalid queue envelope");
        const existing = await prisma.eventRegistration.findUnique({
          where: { submissionId: parsed.data.submissionId },
          select: { id: true },
        });
        if (!existing)
          await createEventRegistration({
            ...parsed.data.registration,
            submissionId: parsed.data.submissionId,
          });
        message.ack();
        console.log(
          `Event registration processed: ${parsed.data.submissionId}`,
        );
      } catch (error) {
        let duplicate = false;
        if (
          parsed.success &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          duplicate = Boolean(
            await prisma.eventRegistration.findUnique({
              where: { submissionId: parsed.data.submissionId },
              select: { id: true },
            }),
          );
        if (duplicate) message.ack();
        else if (
          !parsed.success ||
          message.info.deliveryCount >= 10 ||
          (error instanceof Error &&
            error.message === "Event not found or not accepting registrations")
        ) {
          // Persist rejected/poison submissions before removing the original.
          // If this fails, leave the original available for redelivery.
          await js.publish(
            "seawatch.events.registrations.failed.v1",
            message.data,
            { msgID: `failed:${message.info.streamSequence}` },
          );
          message.ack();
          console.error(
            `Registration needs review; stream sequence ${message.info.streamSequence}.`,
          );
        } else
          message.nak(
            Math.min(
              15 * 60000,
              5000 * 2 ** Math.min(message.info.deliveryCount, 8),
            ),
          );
      } finally {
        clearInterval(pulse);
      }
    }
  } finally {
    await nc.drain();
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Event consumer stopped. Check connectivity and migration state; queued registrations remain in JetStream.",
  );
  process.exit(1);
});
