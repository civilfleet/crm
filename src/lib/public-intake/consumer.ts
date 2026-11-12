import { consumerErrorCodes } from "@/lib/public-events/consumer-errors";

/**
 * Shared JetStream consumer for public intakes (event registrations, website
 * form submissions). One process, one NATS connection, one durable consumer
 * per pipeline. Each pipeline recovers on its own: a missing stream or
 * permission only delays that pipeline and is retried with backoff, so a
 * forms rollout can never stop event registrations.
 *
 * Per-message semantics (unchanged from the separate consumers): one message
 * in flight, ack only after the transaction commits, duplicates acked,
 * rejected/poison messages copied to the failed subject before removal,
 * everything else nak'ed with exponential backoff, parked after 10 deliveries.
 */

export type ParseResult<T> = { success: true; data: T } | { success: false };

export type IntakePipeline<T> = {
  name: string;
  stream: string;
  consumer: string;
  failureSubject: string;
  parse(input: unknown): ParseResult<T>;
  submissionId(data: T): string;
  /** Already persisted (idempotent redelivery / concurrent duplicate). */
  exists(submissionId: string): Promise<boolean>;
  process(data: T): Promise<unknown>;
  /** Permanent rejection: move to the failed subject instead of retrying. */
  isRejection(error: unknown): boolean;
};

export type IntakeMessage = {
  data: Uint8Array;
  json(): unknown;
  working(): void;
  ack(): void;
  nak(delayMs?: number): void;
  info: { deliveryCount: number; streamSequence: number };
};

type MessageStream = AsyncIterable<IntakeMessage> & { stop(): void };

export type IntakeJetStream = {
  publish(
    subject: string,
    data: Uint8Array,
    options?: { msgID?: string },
  ): Promise<unknown>;
  consumers: {
    get(
      stream: string,
      consumer: string,
    ): Promise<{
      consume(options: { max_messages: number }): Promise<MessageStream>;
    }>;
  };
};

export type IntakeManager = {
  consumers: {
    info(stream: string, consumer: string): Promise<unknown>;
    add(stream: string, config: Record<string, unknown>): Promise<unknown>;
  };
};

export type IntakeLogger = {
  log(message: string): void;
  error(message: string): void;
};

const MAX_DELIVERIES = 10;
export const RETRY_DELAY_MS = (deliveryCount: number) =>
  Math.min(15 * 60000, 5000 * 2 ** Math.min(deliveryCount, 8));
/** Pipeline restart delay after a setup or subscription failure. */
export const RESTART_DELAY_MS = (attempt: number) =>
  Math.min(5 * 60000, 5000 * 2 ** Math.min(attempt, 6));

const isUniqueViolation = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "code" in error &&
  (error as { code?: unknown }).code === "P2002";

const isMissing = (error: unknown) =>
  error instanceof Error &&
  "code" in error &&
  ["404", "10014"].includes(String((error as { code?: unknown }).code));

export async function ensureConsumer(
  manager: IntakeManager,
  pipeline: IntakePipeline<unknown>,
) {
  try {
    await manager.consumers.info(pipeline.stream, pipeline.consumer);
  } catch (error) {
    if (!isMissing(error)) throw error;
    await manager.consumers.add(pipeline.stream, {
      durable_name: pipeline.consumer,
      ack_policy: "explicit",
      ack_wait: 60 * 1e9,
      max_ack_pending: 1,
      max_deliver: -1,
    });
  }
}

/**
 * Process one delivery. Throws only when the failed-subject publish fails;
 * the message then stays unacknowledged and is redelivered.
 */
export async function handleMessage<T>(
  js: IntakeJetStream,
  pipeline: IntakePipeline<T>,
  message: IntakeMessage,
  logger: IntakeLogger,
) {
  let input: unknown;
  try {
    input = message.json();
  } catch {
    input = null;
  }
  const parsed = pipeline.parse(input);
  const pulse = setInterval(() => message.working(), 15000);
  try {
    if (!parsed.success) throw new Error("Invalid queue envelope");
    const id = pipeline.submissionId(parsed.data);
    if (!(await pipeline.exists(id))) await pipeline.process(parsed.data);
    message.ack();
    logger.log(`${pipeline.name}: processed ${id}`);
  } catch (error) {
    const duplicate =
      parsed.success &&
      isUniqueViolation(error) &&
      (await pipeline.exists(pipeline.submissionId(parsed.data)));
    if (duplicate) message.ack();
    else if (
      !parsed.success ||
      message.info.deliveryCount >= MAX_DELIVERIES ||
      pipeline.isRejection(error)
    ) {
      // Persist rejected/poison messages before removing the original.
      await js.publish(pipeline.failureSubject, message.data, {
        msgID: `failed:${message.info.streamSequence}`,
      });
      message.ack();
      logger.error(
        `${pipeline.name}: needs review; stream sequence ${message.info.streamSequence}.`,
      );
    } else message.nak(RETRY_DELAY_MS(message.info.deliveryCount));
  } finally {
    clearInterval(pulse);
  }
}

export type IntakeRuntime = {
  js: IntakeJetStream;
  manager: IntakeManager;
  logger: IntakeLogger;
  /** Resolves when shutdown is requested. */
  stopped: Promise<void>;
  isStopping(): boolean;
  /** Register cleanup to run on shutdown (e.g. stop a subscription). */
  onStop(callback: () => void): void;
};

/** Run one pipeline until shutdown, restarting it after failures. */
export async function runPipeline<T>(
  runtime: IntakeRuntime,
  pipeline: IntakePipeline<T>,
) {
  const { js, manager, logger } = runtime;
  for (let attempt = 0; !runtime.isStopping(); attempt++) {
    let phase = "consumer lookup";
    try {
      await ensureConsumer(manager, pipeline as IntakePipeline<unknown>);
      phase = "consumer subscription";
      const consumer = await js.consumers.get(
        pipeline.stream,
        pipeline.consumer,
      );
      const messages = await consumer.consume({ max_messages: 1 });
      runtime.onStop(() => messages.stop());
      if (runtime.isStopping()) messages.stop();
      logger.log(`${pipeline.name}: consumer started.`);
      attempt = -1;
      phase = "processing";
      for await (const message of messages) {
        if (runtime.isStopping()) break;
        await handleMessage(js, pipeline, message, logger);
      }
      if (runtime.isStopping()) return;
      throw Object.assign(new Error("subscription ended"), { code: "ENDED" });
    } catch (error) {
      if (runtime.isStopping()) return;
      logger.error(
        `${pipeline.name}: consumer unavailable, retrying. ${JSON.stringify({
          phase,
          errors: consumerErrorCodes(error),
        })}`,
      );
    }
    const delay = RESTART_DELAY_MS(Math.max(attempt, 0));
    await Promise.race([
      runtime.stopped,
      new Promise((resolve) => setTimeout(resolve, delay).unref?.()),
    ]);
  }
}

/** Run all pipelines concurrently on one connection until shutdown. */
export async function runIntakePipelines(
  runtime: IntakeRuntime,
  pipelines: IntakePipeline<never>[],
) {
  await Promise.all(
    pipelines.map((pipeline) =>
      runPipeline(runtime, pipeline as IntakePipeline<unknown>),
    ),
  );
}
