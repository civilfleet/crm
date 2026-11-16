import assert from "node:assert/strict";
import test from "node:test";
import * as listRequest from "@/lib/list-request";
import { loadModule } from "./helpers/load-module";
import {
  distanceKm,
  geohash,
  geohashBounds,
  intersectsRadius,
} from "../src/lib/public-events/geo";
import { eventPath, isPast, postalShard } from "../src/lib/public-events/types";
import {
  registrationMessage,
  registrationPayload,
} from "../src/lib/public-events/registration";

function registrationService() {
  let registration: Record<string, unknown> | null = null;
  const batches: Record<string, unknown>[] = [];
  let available = true;
  let failEmailQueue = false;
  const proposals: Array<Record<string, unknown>> = [];
  const tx = {
    event: {
      findFirst: async () =>
        available ? { teamId: "team", title: "A <public> event" } : null,
    },
    eventRegistration: {
      findUnique: async () => registration,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        registration = { id: "registration", ...data };
        return registration;
      },
    },
    contact: {
      findUnique: async () => ({
        id: "contact",
        name: "Existing",
        phone: "123",
        emails: [{ kind: "PRIMARY", email: "person@example.org" }],
      }),
    },
    emailBatch: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failEmailQueue) throw new Error("queue unavailable");
        batches.push(data);
        return data;
      },
    },
  };
  const service = loadModule<{
    createEventRegistration: (input: {
      submissionId: string;
      eventId: string;
      name: string;
      email: string;
    }) => Promise<unknown>;
  }>("src/services/events/index.ts", {
    "@/lib/list-request": listRequest,
    "@/lib/countries": {},
    "@/lib/geo": {},
    "@/lib/slug": {},
    "@/lib/prisma": {
      $transaction: async (
        callback: (transaction: typeof tx) => Promise<unknown>,
      ) => {
        const before = registration;
        try {
          return await callback(tx);
        } catch (error) {
          registration = before;
          throw error;
        }
      },
    },
    "@/services/contact-emails": { primaryContactEmailSelect: {} },
    // Real shared intake matching, with its own boundaries mocked.
    "@/services/contact-intake": loadModule(
      "src/services/contact-intake/index.ts",
      {
        "@/services/contact-change-logs": {
          proposeFieldChange: async (
            _tx: unknown,
            proposal: Record<string, unknown>,
          ) => {
            proposals.push(proposal);
            return true;
          },
        },
        "@/services/contacts": {
          findContactByIdentityEmail: async () => ({ id: "contact" }),
        },
        "@/types": { ContactEmailKind: { PRIMARY: "PRIMARY" } },
      },
    ),
    "@/types": { ContactEmailKind: { PRIMARY: "PRIMARY" } },
  });
  return {
    service,
    batches,
    setAvailable: (value: boolean) => {
      available = value;
    },
    setFailEmail: (value: boolean) => {
      failEmailQueue = value;
    },
    saved: () => registration,
    proposals,
  };
}

test("queue redelivery returns the committed registration and queues confirmation once", async () => {
  const harness = registrationService();
  const input = {
    submissionId: "submission",
    eventId: "event",
    name: "Person",
    email: "person@example.org",
  };
  const first = await harness.service.createEventRegistration(input);
  harness.setAvailable(false);
  assert.deepEqual(await harness.service.createEventRegistration(input), first);
  assert.equal(harness.batches.length, 1);
  assert.match(String(harness.batches[0].html), /A &lt;public&gt; event/);
  // The existing name is kept; the registration's differing name is proposed.
  assert.equal(harness.proposals.length, 1);
  assert.deepEqual(
    {
      fieldName: harness.proposals[0].fieldName,
      oldValue: harness.proposals[0].oldValue,
      newValue: harness.proposals[0].newValue,
      userName: harness.proposals[0].userName,
    },
    {
      fieldName: "name",
      oldValue: "Existing",
      newValue: "Person",
      userName: "Event registration",
    },
  );
  assert.equal(
    (harness.proposals[0].metadata as Record<string, unknown>).submissionId,
    "submission",
  );
});

test("failed confirmation enqueue rolls back registration; unpublished events are rejected", async () => {
  const harness = registrationService();
  const input = {
    submissionId: "submission",
    eventId: "event",
    name: "Person",
    email: "person@example.org",
  };
  harness.setFailEmail(true);
  await assert.rejects(
    harness.service.createEventRegistration(input),
    /queue unavailable/,
  );
  assert.equal(harness.saved(), null);
  harness.setAvailable(false);
  await assert.rejects(
    harness.service.createEventRegistration(input),
    /not accepting registrations/,
  );
});

test("radius candidate cells cover boundaries, antimeridian and poles", () => {
  for (const origin of [
    [52.52, 13.405],
    [0, 179.99],
    [89.99, 80],
    [-89.99, -80],
  ]) {
    for (let latitude = -90; latitude <= 90; latitude += 3) {
      for (let longitude = -180; longitude < 180; longitude += 3) {
        if (distanceKm(origin[0], origin[1], latitude, longitude) <= 1000) {
          assert.ok(
            intersectsRadius(
              geohashBounds(geohash(latitude, longitude)),
              origin[0],
              origin[1],
              1000,
            ),
          );
        }
      }
    }
  }
  assert.equal(geohash(42.6, -5.6, 5), "ezs42");
  assert.ok(
    intersectsRadius(geohashBounds(geohash(0, -179.99)), 0, 179.99, 10),
  );
  assert.ok(distanceKm(52.52, 13.405, 48.8566, 2.3522) > 870);
  assert.ok(distanceKm(52.52, 13.405, 48.8566, 2.3522) < 885);
});

test("public paths, postal lookup and archive cutoff", () => {
  assert.equal(postalShard("de", " 10115 "), "DE/10.json");
  assert.equal(postalShard("gb", "SW1A 1AA"), "GB/SW.json");
  assert.equal(
    eventPath({ teamId: "team", slug: "hello world" }),
    "/public/team/events/hello%20world/",
  );
  assert.equal(
    isPast(
      { startDate: "2026-01-01T10:00:00Z", endDate: "2026-01-03T10:00:00Z" },
      Date.parse("2026-01-02"),
    ),
    false,
  );
});

test("intake rejects unbounded fields and private contact data", () => {
  const payload = {
    eventId: "7c5b88ed-2b5f-4016-9181-79d28219ade2",
    name: "Example",
    email: "example@example.org",
  };
  assert.ok(registrationPayload.safeParse(payload).success);
  assert.equal(
    registrationPayload.safeParse({ ...payload, name: "x".repeat(256) })
      .success,
    false,
  );
  assert.equal(
    registrationPayload.safeParse({ ...payload, contactId: "private" }).success,
    false,
  );
  assert.equal(
    registrationMessage.safeParse({ version: 2, registration: payload })
      .success,
    false,
  );
});
