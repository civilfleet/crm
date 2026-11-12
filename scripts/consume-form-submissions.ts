import "dotenv/config";
import { AckPolicy, jetstream, jetstreamManager } from "@nats-io/jetstream";
import { connect, wsconnect } from "@nats-io/transport-node";
import { Prisma } from "@prisma/client";
import prisma from "../src/lib/prisma";
import {
  FORM_SUBMISSION_CONSUMER,
  FORM_SUBMISSION_FAILURE_SUBJECT,
  FORM_SUBMISSION_STREAM,
  formSubmissionMessage,
} from "../src/lib/public-forms/submission";
import {
  createFormSubmission,
  FormSubmissionRejectedError,
} from "../src/services/form-submissions";

// Same reliability semantics as consume-event-registrations.ts: one message in
// flight, explicit ack only after commit, rejected/poison messages are copied
// to the failed subject before removal, everything else is retried with backoff.
async function main() {
  const server = process.env.NATS_URL;
  if (!server || !process.env.NATS_USER || !process.env.NATS_PASSWORD)
    throw new Error("NATS_URL, NATS_USER and NATS_PASSWORD are required.");
  const options = {
    servers: server,
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASSWORD,
    name: "crm-form-submissions",
    inboxPrefix: "_INBOX.crm",
    maxReconnectAttempts: -1,
  };
  const nc = await (/^wss?:/.test(server)
    ? wsconnect(options)
    : connect(options));
  const js = jetstream(nc);
  const manager = await jetstreamManager(nc);
  try {
    await manager.consumers.info(
      FORM_SUBMISSION_STREAM,
      FORM_SUBMISSION_CONSUMER,
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      !["404", "10014"].includes(String(error.code))
    )
      throw error;
    await manager.consumers.add(FORM_SUBMISSION_STREAM, {
      durable_name: FORM_SUBMISSION_CONSUMER,
      ack_policy: AckPolicy.Explicit,
      ack_wait: 60 * 1e9,
      max_ack_pending: 1,
      max_deliver: -1,
    });
  }
  const consumer = await js.consumers.get(
    FORM_SUBMISSION_STREAM,
    FORM_SUBMISSION_CONSUMER,
  );
  const messages = await consumer.consume({ max_messages: 1 });
  let stopping = false;
  const stop = () => {
    stopping = true;
    messages.stop();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  console.log("CRM form submission consumer started.");
  try {
    for await (const message of messages) {
      if (stopping) break;
      let input: unknown;
      try {
        input = message.json();
      } catch {
        input = null;
      }
      const parsed = formSubmissionMessage.safeParse(input);
      const pulse = setInterval(() => message.working(), 15000);
      try {
        if (!parsed.success) throw new Error("Invalid queue envelope");
        const existing = await prisma.formSubmission.findUnique({
          where: { submissionId: parsed.data.submissionId },
          select: { id: true },
        });
        if (!existing) await createFormSubmission(parsed.data);
        message.ack();
        console.log(`Form submission processed: ${parsed.data.submissionId}`);
      } catch (error) {
        let duplicate = false;
        if (
          parsed.success &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          duplicate = Boolean(
            await prisma.formSubmission.findUnique({
              where: { submissionId: parsed.data.submissionId },
              select: { id: true },
            }),
          );
        if (duplicate) message.ack();
        else if (
          !parsed.success ||
          message.info.deliveryCount >= 10 ||
          error instanceof FormSubmissionRejectedError
        ) {
          // Persist rejected/poison submissions before removing the original.
          // If this fails, leave the original available for redelivery.
          await js.publish(FORM_SUBMISSION_FAILURE_SUBJECT, message.data, {
            msgID: `failed:${message.info.streamSequence}`,
          });
          message.ack();
          console.error(
            `Form submission needs review; stream sequence ${message.info.streamSequence}.`,
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
    "Form consumer stopped. Check connectivity and migration state; queued submissions remain in JetStream.",
  );
  process.exit(1);
});
