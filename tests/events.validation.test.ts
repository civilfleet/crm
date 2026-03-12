import assert from "node:assert/strict";
import test from "node:test";
import {
  createEventRegistrationSchema,
  createEventSchema,
} from "../validations/events";

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_TYPE_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "33333333-3333-4333-8333-333333333333";
const ROLE_ID = "44444444-4444-4444-8444-444444444444";
const LIST_ID = "55555555-5555-4555-8555-555555555555";
const EVENT_ID = "66666666-6666-4666-8666-666666666666";

test("createEventSchema coerces booleans and numbers and applies defaults", () => {
  const parsed = createEventSchema.parse({
    teamId: TEAM_ID,
    title: "Quarterly planning",
    slug: "   ",
    description: "",
    location: "Remote",
    eventTypeId: EVENT_TYPE_ID,
    isOnline: "true",
    expectedGuests: "150",
    hasRemuneration: "false",
    address: "",
    city: "Berlin",
    postalCode: "",
    state: "",
    timeZone: "Europe/Berlin",
    merchNeeded: true,
    startDate: "2026-04-01T09:00:00.000Z",
    endDate: "",
    isPublic: "true",
    contacts: [{ contactId: CONTACT_ID, roleIds: [ROLE_ID] }],
    listIds: [LIST_ID],
  });

  assert.deepEqual(parsed, {
    teamId: TEAM_ID,
    title: "Quarterly planning",
    slug: undefined,
    description: undefined,
    location: "Remote",
    eventTypeId: EVENT_TYPE_ID,
    isOnline: true,
    expectedGuests: 150,
    hasRemuneration: false,
    address: undefined,
    city: "Berlin",
    postalCode: undefined,
    state: undefined,
    timeZone: "Europe/Berlin",
    merchNeeded: true,
    startDate: "2026-04-01T09:00:00.000Z",
    endDate: undefined,
    isPublic: true,
    contacts: [{ contactId: CONTACT_ID, roleIds: [ROLE_ID] }],
    listIds: [LIST_ID],
  });
});

test("createEventSchema defaults optional arrays and booleans when omitted", () => {
  const parsed = createEventSchema.parse({
    teamId: TEAM_ID,
    title: "Volunteer fair",
    startDate: "2026-06-10T12:00:00.000Z",
  });

  assert.equal(parsed.isOnline, false);
  assert.equal(parsed.hasRemuneration, false);
  assert.equal(parsed.merchNeeded, false);
  assert.equal(parsed.isPublic, false);
  assert.deepEqual(parsed.contacts, []);
  assert.deepEqual(parsed.listIds, []);
});

test("createEventSchema rejects invalid numeric and date inputs", () => {
  assert.throws(
    () =>
      createEventSchema.parse({
        teamId: TEAM_ID,
        title: "Broken event",
        startDate: "2026-04-01T09:00:00.000Z",
        endDate: "not-a-date",
      }),
    /Invalid end date/,
  );

  assert.throws(
    () =>
      createEventSchema.parse({
        teamId: TEAM_ID,
        title: "Broken event",
        startDate: "2026-04-01T09:00:00.000Z",
        expectedGuests: "many",
      }),
    /expected number, received string/i,
  );
});

test("createEventRegistrationSchema trims required fields and preserves custom data", () => {
  const parsed = createEventRegistrationSchema.parse({
    eventId: EVENT_ID,
    name: "  Alex Example  ",
    email: "  alex@example.org  ",
    phone: "",
    notes: "  Needs wheelchair access  ",
    customData: {
      dietary: "vegetarian",
    },
  });

  assert.deepEqual(parsed, {
    eventId: EVENT_ID,
    name: "Alex Example",
    email: "alex@example.org",
    phone: undefined,
    notes: "  Needs wheelchair access  ",
    customData: {
      dietary: "vegetarian",
    },
  });
});
