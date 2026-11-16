import assert from "node:assert/strict";
import test from "node:test";
import * as registrationModule from "../src/lib/public-events/registration";
import * as confirmationModule from "../src/lib/public-forms/confirmation";
import * as submissionModule from "../src/lib/public-forms/submission";
import {
  ensureConsumer,
  type IntakeMessage,
  type IntakePipeline,
  type IntakeRuntime,
  runIntakePipelines,
} from "../src/lib/public-intake/consumer";
import { loadModule } from "./helpers/load-module";

type Delivered = { pipeline: string; outcome: string };

function pipeline(
  name: string,
  rows: Set<string>,
): IntakePipeline<{ id: string }> {
  return {
    name,
    stream: `${name}-stream`,
    consumer: `${name}-consumer`,
    failureSubject: `${name}.failed`,
    parse: (input) =>
      input && typeof input === "object" && "id" in input
        ? { success: true, data: input as { id: string } }
        : { success: false },
    submissionId: (data) => data.id,
    exists: async (id) => rows.has(id),
    process: async (data) => {
      rows.add(data.id);
    },
    isRejection: () => false,
  };
}

const delivery = (
  pipelineName: string,
  data: unknown,
  delivered: Delivered[],
): IntakeMessage => ({
  data: new TextEncoder().encode(JSON.stringify(data)),
  json: () => data,
  working: () => {},
  ack: () => delivered.push({ pipeline: pipelineName, outcome: "ack" }),
  nak: () => delivered.push({ pipeline: pipelineName, outcome: "nak" }),
  info: { deliveryCount: 1, streamSequence: 1 },
});

/** A runtime whose streams are scripted per pipeline; stop() ends the run. */
function runtime(script: {
  info?: Record<string, () => Promise<unknown>>;
  messages?: Record<string, IntakeMessage[]>;
}) {
  let stopping = false;
  const callbacks: Array<() => void> = [];
  let resolveStopped: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  const logs: string[] = [];
  const added: string[] = [];
  const stop = () => {
    stopping = true;
    for (const callback of callbacks) callback();
    resolveStopped();
  };
  const value: IntakeRuntime = {
    logger: {
      log: (message) => logs.push(message),
      error: (message) => logs.push(message),
    },
    stopped,
    isStopping: () => stopping,
    onStop: (callback) => callbacks.push(callback),
    manager: {
      consumers: {
        info: (stream) => (script.info?.[stream] ?? (async () => ({})))(),
        add: async (stream) => {
          added.push(stream);
        },
      },
    },
    js: {
      publish: async () => ({}),
      consumers: {
        get: async (stream) => ({
          consume: async () => {
            const queue = [...(script.messages?.[stream] ?? [])];
            let ended: () => void = () => {};
            const done = new Promise<void>((resolve) => {
              ended = resolve;
            });
            return {
              stop: () => ended(),
              async *[Symbol.asyncIterator]() {
                while (queue.length) yield queue.shift() as IntakeMessage;
                await done; // a live subscription waits for more messages
              },
            };
          },
        }),
      },
    },
  };
  return { value, stop, logs, added };
}

test("one pipeline's broken stream does not stop the other", async () => {
  const delivered: Delivered[] = [];
  const events = new Set<string>();
  const forms = new Set<string>();
  const run = runtime({
    info: {
      // Forms stream not created yet / no permission: setup keeps failing.
      "forms-stream": async () => {
        throw Object.assign(new Error("no permission"), { code: "10059" });
      },
    },
    messages: {
      "events-stream": [
        delivery("events", { id: "a" }, delivered),
        delivery("events", { id: "b" }, delivered),
      ],
    },
  });
  const running = runIntakePipelines(run.value, [
    pipeline("events", events),
    pipeline("forms", forms),
  ] as IntakePipeline<never>[]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  run.stop();
  await running;
  assert.deepEqual([...events], ["a", "b"]);
  assert.deepEqual(delivered, [
    { pipeline: "events", outcome: "ack" },
    { pipeline: "events", outcome: "ack" },
  ]);
  const failure = run.logs.find((line) => line.startsWith("forms:"));
  assert.match(String(failure), /consumer unavailable, retrying/);
  assert.match(String(failure), /"phase":"consumer lookup"/);
  assert.match(String(failure), /"errors":\["10059"\]/);
  assert.doesNotMatch(run.logs.join("\n"), /no permission/);
});

test("a pipeline restarts after its subscription ends, and shutdown stops all", async () => {
  const forms = new Set<string>();
  let lookups = 0;
  const run = runtime({
    info: {
      "forms-stream": async () => {
        lookups++;
        if (lookups === 1)
          throw Object.assign(new Error("timeout"), { code: "TIMEOUT" });
        return {};
      },
    },
    messages: {
      "forms-stream": [delivery("forms", { id: "x" }, [])],
    },
  });
  const restartDelay = setTimeout;
  // Make the restart backoff immediate for the test.
  (globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((
    callback: () => void,
  ) => restartDelay(callback, 0)) as typeof setTimeout;
  try {
    const running = runIntakePipelines(run.value, [
      pipeline("forms", forms),
    ] as IntakePipeline<never>[]);
    await new Promise((resolve) => restartDelay(resolve, 50));
    run.stop();
    await running;
  } finally {
    (globalThis as { setTimeout: typeof setTimeout }).setTimeout = restartDelay;
  }
  assert.equal(lookups, 2);
  assert.deepEqual([...forms], ["x"]);
  assert.ok(run.logs.some((line) => line === "forms: consumer started."));
});

test("a missing durable consumer is created with the shared settings", async () => {
  const added: Array<Record<string, unknown>> = [];
  await ensureConsumer(
    {
      consumers: {
        info: async () => {
          throw Object.assign(new Error("consumer not found"), {
            code: "10014",
          });
        },
        add: async (_stream, config) => {
          added.push(config);
        },
      },
    },
    pipeline("forms", new Set()) as IntakePipeline<unknown>,
  );
  assert.deepEqual(added, [
    {
      durable_name: "forms-consumer",
      ack_policy: "explicit",
      ack_wait: 60 * 1e9,
      max_ack_pending: 1,
      max_deliver: -1,
    },
  ]);
  await assert.rejects(
    ensureConsumer(
      {
        consumers: {
          info: async () => {
            throw Object.assign(new Error("denied"), { code: "10100" });
          },
          add: async () => assert.fail("must not create on other errors"),
        },
      },
      pipeline("forms", new Set()) as IntakePipeline<unknown>,
    ),
  );
});

test("intake pipelines keep the event and form streams and rejection rules", () => {
  const { eventRegistrationPipeline, formSubmissionPipeline, intakePipelines } =
    loadModule<{
      eventRegistrationPipeline: IntakePipeline<unknown>;
      formSubmissionPipeline: IntakePipeline<unknown>;
      intakePipelines: IntakePipeline<unknown>[];
    }>("src/lib/public-intake/pipelines.ts", {
      "@/lib/prisma": {},
      "@/lib/public-events/registration": registrationModule,
      "@/lib/public-forms/submission": submissionModule,
      "@/services/form-submissions": {
        FormSubmissionRejectedError: class extends Error {},
      },
      "@/services/events": {},
      "@/lib/public-forms/confirmation": confirmationModule,
      "@/services/form-confirmations": {},
    });
  assert.deepEqual(
    intakePipelines.map((p) => [p.stream, p.consumer, p.failureSubject]),
    [
      [
        "SEAWATCH_EVENT_REGISTRATIONS",
        "crm-event-registrations-v1",
        "seawatch.events.registrations.failed.v1",
      ],
      [
        "SEAWATCH_FORM_SUBMISSIONS",
        "crm-form-submissions-v1",
        "seawatch.forms.submissions.failed.v1",
      ],
      [
        "SEAWATCH_FORM_CONFIRMATIONS",
        "crm-form-confirmations-v1",
        "seawatch.forms.confirmations.failed.v1",
      ],
    ],
  );
  assert.equal(
    eventRegistrationPipeline.isRejection(
      new Error("Event not found or not accepting registrations"),
    ),
    true,
  );
  assert.equal(
    eventRegistrationPipeline.isRejection(new Error("database unavailable")),
    false,
  );
  assert.equal(formSubmissionPipeline.isRejection(new Error("x")), false);
});
