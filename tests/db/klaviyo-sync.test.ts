import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { db, disconnect, loadService, resetDatabase } from "./helpers";

/*
  Klaviyo sync against a real database (docs/DATA_RULES.md, "Klaviyo"), with
  Klaviyo's API replaced by a fake that serves profiles, metrics and events
  and records what the CRM sends.
*/

type SyncResult = {
  contactsCreated: number;
  contactsMatched: number;
  changesProposed: number;
  profilesSkipped: number;
  engagementsUpserted: number;
  eventsSkipped: number;
  consentsWithdrawn: number;
  withdrawalsProposed: number;
  consentsSent: number;
  consentsSkipped: number;
  consentsFailed: number;
  consentsWaiting: string[];
  deletionsMarked: number;
  deletionsNotInKlaviyo: number;
  failures: number;
};
type KlaviyoService = {
  syncKlaviyoIntegration: (
    teamId: string,
    options?: { now?: Date },
  ) => Promise<SyncResult>;
  deleteKlaviyoIntegration: (teamId: string) => Promise<void>;
  saveKlaviyoIntegration: (input: {
    teamId: string;
    isEnabled?: boolean;
    sendConsents?: boolean;
  }) => Promise<unknown>;
};
type QueueService = {
  enqueueKlaviyoSyncJob: (teamId: string) => Promise<{ id: string }>;
  enqueueDueKlaviyoSyncs: (intervalMs: number, now?: Date) => Promise<number>;
};
type ProposalsService = {
  getPendingProposals: (
    teamId: string,
    viewer: { roles?: string[] },
  ) => Promise<{
    data: Array<{
      id: string;
      field: string;
      currentValue: string | null;
      proposedValue: string | null;
      source: string | null;
    }>;
  }>;
  resolveProposal: (
    input: { teamId: string; proposalId: string; decision: string },
    viewer: { userId?: string; userName?: string; roles?: string[] },
  ) => Promise<unknown>;
};
type ContactsService = {
  permanentlyDeleteContacts: (
    teamId: string,
    ids: string[],
    userId?: string,
    roles?: string[],
  ) => Promise<number>;
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const klaviyo = loadService<KlaviyoService>(
  "src/services/integrations/klaviyo.ts",
  { "@/lib/api-guard": { ApiError } },
);
const queue = loadService<QueueService>(
  "src/services/integrations/klaviyo-queue.ts",
);
const proposals = loadService<ProposalsService>(
  "src/services/contact-proposals/index.ts",
  { "@/lib/api-guard": { ApiError } },
);
const contacts = loadService<ContactsService>(
  "src/services/contacts/index.ts",
  {
    "@/lib/api-guard": { ApiError },
  },
);

type FakeProfile = {
  id: string;
  attributes: Record<string, unknown>;
};
type FakeEvent = {
  id: string;
  metric: string;
  profileId: string;
  datetime: string;
  properties?: Record<string, unknown>;
};

const METRIC_IDS: Record<string, string> = {
  "Received Email": "M_RECEIVED",
  "Opened Email": "M_OPENED",
  "Clicked Email": "M_CLICKED",
  "Unsubscribed from Email Marketing": "M_UNSUB",
  "Viewed Product": "M_VIEWED",
};

type SentBody = {
  data: {
    attributes: {
      profiles: {
        data: Array<{
          attributes: {
            email: string;
            subscriptions: {
              email: { marketing: { consent: string; consented_at?: string } };
            };
          };
        }>;
      };
    };
  };
};

let fake: {
  profiles: FakeProfile[];
  events: FakeEvent[];
  sent: Array<{ path: string; body: SentBody }>;
  /** Addresses whose subscribe call Klaviyo refuses with a 400. */
  refuse: Set<string>;
  /** Profile property updates (PATCH /profiles/{id}). */
  patched: Array<{ id: string; properties: Record<string, string> }>;
};

const realFetch = globalThis.fetch;
beforeEach(async () => {
  await resetDatabase();
  fake = {
    profiles: [],
    events: [],
    sent: [],
    refuse: new Set(),
    patched: [],
  };
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/api/, "");
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status });
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      fake.patched.push({
        id: path.replace("/profiles/", ""),
        properties: body.data.attributes.properties,
      });
      return json({ data: body.data });
    }
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as SentBody;
      const emails: string[] = body.data.attributes.profiles.data.map(
        (entry) => entry.attributes.email,
      );
      if (emails.some((email) => fake.refuse.has(email))) {
        return json({ errors: [{ detail: "Invalid email" }] }, 400);
      }
      fake.sent.push({ path, body });
      return new Response(null, { status: 202 });
    }
    if (path === "/profiles") {
      // A lookup by address: any(email,["a@x.org",...]).
      const lookup = /^any\(email,(\[.*\])\)$/.exec(
        url.searchParams.get("filter") ?? "",
      );
      if (lookup) {
        const wanted: string[] = JSON.parse(lookup[1]);
        return json({
          data: fake.profiles.filter((profile) =>
            wanted.includes(String(profile.attributes.email)),
          ),
        });
      }
      return json({ data: fake.profiles, links: {} });
    }
    if (path === "/metrics") {
      return json({
        data: Object.entries(METRIC_IDS).map(([name, id]) => ({
          id,
          type: "metric",
          attributes: { name, integration: { name: "Klaviyo" } },
        })),
      });
    }
    if (path === "/events") {
      const metricId = /metric_id,"([^"]+)"/.exec(
        url.searchParams.get("filter") ?? "",
      )?.[1];
      const events = fake.events.filter(
        (event) => METRIC_IDS[event.metric] === metricId,
      );
      return json({
        data: events.map((event) => ({
          id: event.id,
          type: "event",
          attributes: {
            datetime: event.datetime,
            event_properties: event.properties ?? {},
          },
          relationships: {
            profile: { data: { id: event.profileId, type: "profile" } },
          },
        })),
        included: fake.profiles.map((profile) => ({
          id: profile.id,
          type: "profile",
          attributes: { email: profile.attributes.email },
        })),
      });
    }
    throw new Error(`Unexpected Klaviyo call ${path}`);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
after(disconnect);

const setUp = async ({
  listId = "LIST",
  sendConsents = true,
}: {
  listId?: string | null;
  sendConsents?: boolean;
} = {}) => {
  const team = await db.teams.create({
    data: {
      name: `Team ${Date.now()}`,
      email: `team-${Date.now()}@example.org`,
    },
  });
  await db.integrationConnection.create({
    data: {
      teamId: team.id,
      provider: "KLAVIYO",
      // Stored in plaintext: legacy values are read as they are.
      apiKey: "pk_test",
      defaultListId: listId,
      sendConsents,
    },
  });
  return team.id;
};

const createContact = (
  teamId: string,
  email: string,
  data: Record<string, unknown> = {},
) =>
  db.contact.create({
    data: {
      teamId,
      name: "Ana Rossi",
      ...data,
      emails: { create: [{ teamId, email, kind: "PRIMARY" }] },
    },
  });

const consent = (
  teamId: string,
  contactId: string,
  status: "GRANTED" | "WITHDRAWN",
  recordedAt: string,
) =>
  db.contactConsent.create({
    data: {
      teamId,
      contactId,
      purpose: "marketing",
      status,
      source: "FORM",
      recordedAt: new Date(recordedAt),
    },
  });

test("an existing contact keeps its values; differences are proposed once", async () => {
  const teamId = await setUp();
  const ana = await createContact(teamId, "ana@example.org", { city: "Rome" });
  fake.profiles = [
    {
      id: "P1",
      attributes: {
        email: "ANA@example.org",
        phone_number: "+39 06 1234567",
        location: { city: "Milan" },
      },
    },
    {
      id: "P2",
      attributes: { email: "ben@example.org", first_name: "Ben" },
    },
  ];

  const result = await klaviyo.syncKlaviyoIntegration(teamId);
  assert.equal(result.contactsMatched, 1);
  assert.equal(result.contactsCreated, 1);
  assert.equal(result.changesProposed, 1);

  const after = await db.contact.findUniqueOrThrow({ where: { id: ana.id } });
  // No name in Klaviyo: the name stays. An empty phone is filled; a
  // different city is only proposed.
  assert.equal(after.name, "Ana Rossi");
  assert.equal(after.phone, "+39 06 1234567");
  assert.equal(after.city, "Rome");
  const proposals = await db.contactChangeLog.findMany({
    where: { contactId: ana.id, action: "PROPOSED" },
  });
  assert.deepEqual(
    proposals.map((log) => [log.fieldName, log.newValue, log.userName]),
    [["city", JSON.stringify("Milan"), "Klaviyo"]],
  );

  const ben = await db.contact.findFirstOrThrow({
    where: { teamId, name: "Ben" },
  });
  const creation = await db.contactChangeLog.findFirstOrThrow({
    where: { contactId: ben.id, action: "CREATED" },
  });
  assert.equal((creation.metadata as { source?: string }).source, "klaviyo");

  // The next sync sees the same profile: no second proposal.
  const again = await klaviyo.syncKlaviyoIntegration(teamId);
  assert.equal(again.changesProposed, 0);
  assert.equal(
    await db.contactChangeLog.count({
      where: { contactId: ana.id, action: "PROPOSED" },
    }),
    1,
  );
});

test("contacts in the trash or deleted for good are not brought back", async () => {
  const teamId = await setUp();
  const trashed = await createContact(teamId, "trash@example.org", {
    deletedAt: new Date(),
  });
  const deleted = await createContact(teamId, "gone@example.org", {
    deletedAt: new Date(),
  });
  assert.equal(
    await contacts.permanentlyDeleteContacts(teamId, [deleted.id], undefined, [
      "Admin",
    ]),
    1,
  );
  fake.profiles = [
    { id: "P1", attributes: { email: "trash@example.org", first_name: "T" } },
    { id: "P2", attributes: { email: "gone@example.org", first_name: "G" } },
  ];
  fake.events = [
    {
      id: "E1",
      metric: "Received Email",
      profileId: "P1",
      datetime: new Date().toISOString(),
    },
    {
      id: "E2",
      metric: "Received Email",
      profileId: "P2",
      datetime: new Date().toISOString(),
    },
  ];

  // Before: a trashed address made the whole sync fail.
  const result = await klaviyo.syncKlaviyoIntegration(teamId);
  assert.equal(result.failures, 0);
  assert.equal(result.profilesSkipped, 2);
  assert.equal(result.contactsCreated, 0);
  assert.equal(result.eventsSkipped, 2);
  assert.equal(await db.contact.count({ where: { teamId } }), 1);
  assert.notEqual(
    (await db.contact.findUniqueOrThrow({ where: { id: trashed.id } }))
      .deletedAt,
    null,
  );
  assert.equal(await db.contactEngagement.count(), 0);
  // Only a hash of the deleted address is kept.
  const blocks = await db.contactImportBlock.findMany();
  assert.equal(blocks.length, 1);
  assert.match(blocks[0].emailHash, /^[0-9a-f]{64}$/);
});

test("only e-mail events are imported, and opens collapse per e-mail", async () => {
  const teamId = await setUp();
  const ana = await createContact(teamId, "ana@example.org");
  fake.profiles = [{ id: "P1", attributes: { email: "ana@example.org" } }];
  const properties = { Subject: "November update", $message: "MSG1" };
  const now = Date.now();
  const at = (minutes: number) =>
    new Date(now - minutes * 60_000).toISOString();
  fake.events = [
    {
      id: "E1",
      metric: "Received Email",
      profileId: "P1",
      datetime: at(30),
      properties,
    },
    {
      id: "E2",
      metric: "Opened Email",
      profileId: "P1",
      datetime: at(20),
      properties,
    },
    {
      id: "E3",
      metric: "Opened Email",
      profileId: "P1",
      datetime: at(10),
      properties,
    },
    { id: "E4", metric: "Viewed Product", profileId: "P1", datetime: at(5) },
  ];

  await klaviyo.syncKlaviyoIntegration(teamId);
  const engagements = await db.contactEngagement.findMany({
    where: { contactId: ana.id },
    orderBy: { engagedAt: "asc" },
  });
  assert.deepEqual(
    engagements.map((entry) => [entry.externalId, entry.direction]),
    [
      ["E1", "OUTBOUND"],
      // The first open is kept, the second only confirms it.
      ["opened:MSG1:P1", "INBOUND"],
    ],
  );
  assert.equal(engagements[1].engagedAt.toISOString(), at(20));
});

test("marketing consents go to Klaviyo; unsubscribes there come back", async () => {
  const teamId = await setUp();
  const ana = await createContact(teamId, "ana@example.org");
  const ben = await createContact(teamId, "ben@example.org");
  const cleo = await createContact(teamId, "cleo@example.org");
  await consent(teamId, ana.id, "GRANTED", "2026-11-01T10:00:00Z");
  const benGrant = await consent(
    teamId,
    ben.id,
    "GRANTED",
    "2026-11-01T10:00:00Z",
  );
  await consent(teamId, ben.id, "WITHDRAWN", "2026-11-02T10:00:00Z");
  const cleoGrant = await consent(
    teamId,
    cleo.id,
    "GRANTED",
    "2026-11-01T10:00:00Z",
  );
  fake.profiles = [
    {
      id: "P3",
      attributes: {
        email: "cleo@example.org",
        subscriptions: {
          email: {
            marketing: {
              consent: "UNSUBSCRIBED",
              last_updated: "2026-11-05T08:00:00+00:00",
            },
          },
        },
      },
    },
  ];

  const result = await klaviyo.syncKlaviyoIntegration(teamId);

  // Cleo unsubscribed in Klaviyo after consenting: the CRM records it.
  const cleoNow = await db.contactConsent.findFirstOrThrow({
    where: { contactId: cleo.id },
    orderBy: { recordedAt: "desc" },
  });
  assert.equal(cleoNow.status, "WITHDRAWN");
  assert.equal(cleoNow.source, "EXTERNAL");
  assert.equal(cleoNow.recordedBy, "Klaviyo");
  assert.equal(result.consentsWithdrawn, 1);

  // Ana is subscribed with her consent time; Ben only unsubscribed; nothing
  // goes back to Klaviyo for Cleo.
  assert.deepEqual(
    fake.sent.map(({ path, body }) => [
      path,
      body.data.attributes.profiles.data.map((entry) => entry.attributes.email),
    ]),
    [
      ["/profile-subscription-bulk-create-jobs", ["ana@example.org"]],
      ["/profile-subscription-bulk-delete-jobs", ["ben@example.org"]],
    ],
  );
  assert.equal(
    fake.sent[0].body.data.attributes.profiles.data[0].attributes.subscriptions
      .email.marketing.consented_at,
    "2026-11-01T10:00:00.000Z",
  );
  assert.equal(result.consentsSent, 2);
  const skipped = await db.klaviyoConsentSync.findMany({
    where: { status: "SKIPPED" },
    orderBy: { consentId: "asc" },
  });
  assert.deepEqual(
    skipped.map((row) => row.consentId).sort(),
    [benGrant.id, cleoGrant.id, cleoNow.id].sort(),
  );

  // Sent once: the next sync sends nothing.
  fake.sent = [];
  await klaviyo.syncKlaviyoIntegration(teamId);
  assert.deepEqual(fake.sent, []);
});

test("without a list grants wait and withdrawals still go", async () => {
  const teamId = await setUp({ listId: null });
  const ana = await createContact(teamId, "ana@example.org");
  const ben = await createContact(teamId, "ben@example.org");
  const anaGrant = await consent(
    teamId,
    ana.id,
    "GRANTED",
    "2026-11-01T10:00:00Z",
  );
  await consent(teamId, ben.id, "WITHDRAWN", "2026-11-01T10:00:00Z");

  const result = await klaviyo.syncKlaviyoIntegration(teamId);
  assert.deepEqual(
    fake.sent.map(({ path }) => path),
    ["/profile-subscription-bulk-delete-jobs"],
  );
  assert.equal(result.consentsWaiting.length, 1);
  assert.equal(
    await db.klaviyoConsentSync.count({ where: { consentId: anaGrant.id } }),
    0,
  );

  await db.integrationConnection.updateMany({
    where: { teamId },
    data: { defaultListId: "LIST" },
  });
  fake.sent = [];
  await klaviyo.syncKlaviyoIntegration(teamId);
  assert.deepEqual(
    fake.sent.map(({ path }) => path),
    ["/profile-subscription-bulk-create-jobs"],
  );
});

test("one address Klaviyo refuses does not hold back the others", async () => {
  const teamId = await setUp();
  const good = await createContact(teamId, "ana@example.org");
  const bad = await createContact(teamId, "bad@example.org");
  await consent(teamId, good.id, "GRANTED", "2026-11-01T10:00:00Z");
  const badGrant = await consent(
    teamId,
    bad.id,
    "GRANTED",
    "2026-11-01T10:00:00Z",
  );
  fake.refuse.add("bad@example.org");

  const result = await klaviyo.syncKlaviyoIntegration(teamId);
  assert.equal(result.consentsSent, 1);
  assert.equal(result.consentsFailed, 1);
  const failed = await db.klaviyoConsentSync.findUniqueOrThrow({
    where: { consentId: badGrant.id },
  });
  assert.equal(failed.status, "FAILED");
  assert.match(failed.detail ?? "", /Invalid email/);

  // Retried on the next sync.
  fake.refuse.clear();
  await klaviyo.syncKlaviyoIntegration(teamId);
  const retried = await db.klaviyoConsentSync.findUniqueOrThrow({
    where: { consentId: badGrant.id },
  });
  assert.equal(retried.status, "SENT");
  assert.equal(retried.attempts, 2);
});

test("one sync per team is queued at a time, and due teams are queued", async () => {
  const teamId = await setUp();
  const first = await queue.enqueueKlaviyoSyncJob(teamId);
  const second = await queue.enqueueKlaviyoSyncJob(teamId);
  assert.equal(first.id, second.id);
  // A concurrent insert is refused by the database itself.
  await assert.rejects(db.klaviyoSyncJob.create({ data: { teamId } }));

  await db.klaviyoSyncJob.updateMany({ data: { status: "SUCCEEDED" } });
  assert.equal(await queue.enqueueDueKlaviyoSyncs(15 * 60_000), 1);
  // Synced recently: not due.
  await db.klaviyoSyncJob.updateMany({ data: { status: "SUCCEEDED" } });
  await db.integrationConnection.updateMany({
    where: { teamId },
    data: { lastSyncedAt: new Date() },
  });
  assert.equal(await queue.enqueueDueKlaviyoSyncs(15 * 60_000), 0);
});

test("disconnecting forgets what was sent, keeps the CRM's data", async () => {
  const teamId = await setUp();
  const ana = await createContact(teamId, "ana@example.org");
  await consent(teamId, ana.id, "GRANTED", "2026-11-01T10:00:00Z");
  await klaviyo.syncKlaviyoIntegration(teamId);
  await queue.enqueueKlaviyoSyncJob(teamId);

  await klaviyo.deleteKlaviyoIntegration(teamId);
  assert.equal(await db.integrationConnection.count({ where: { teamId } }), 0);
  assert.equal(await db.klaviyoSyncJob.count({ where: { teamId } }), 0);
  assert.equal(await db.klaviyoConsentSync.count({ where: { teamId } }), 0);
  assert.equal(await db.contactConsent.count({ where: { teamId } }), 1);
  assert.equal(await db.contact.count({ where: { teamId } }), 1);
});

test("leaving the team's list is proposed for review, not applied", async () => {
  const teamId = await setUp();
  const ana = await createContact(teamId, "ana@example.org");
  await consent(teamId, ana.id, "GRANTED", "2026-11-01T10:00:00Z");
  fake.profiles = [
    {
      id: "P1",
      attributes: {
        email: "ana@example.org",
        subscriptions: {
          email: {
            marketing: {
              consent: "SUBSCRIBED",
              list_suppressions: [
                {
                  list_id: "LIST",
                  reason: "UNSUBSCRIBE",
                  timestamp: "2026-11-05T08:00:00+00:00",
                },
              ],
            },
          },
        },
      },
    },
  ];

  const result = await klaviyo.syncKlaviyoIntegration(teamId);
  assert.equal(result.withdrawalsProposed, 1);
  assert.equal(result.consentsWithdrawn, 0);
  // The consent still holds until someone decides.
  assert.equal(
    await db.contactConsent.count({
      where: { contactId: ana.id, status: "WITHDRAWN" },
    }),
    0,
  );
  const pending = await proposals.getPendingProposals(teamId, {
    roles: ["Admin"],
  });
  assert.deepEqual(
    pending.data.map((row) => [
      row.field,
      row.currentValue,
      row.proposedValue,
      row.source,
    ]),
    [["marketingConsent", "GRANTED", "WITHDRAWN", "Klaviyo"]],
  );

  // The next sync reports the same: not proposed again.
  const again = await klaviyo.syncKlaviyoIntegration(teamId);
  assert.equal(again.withdrawalsProposed, 0);

  await proposals.resolveProposal(
    { teamId, proposalId: pending.data[0].id, decision: "apply" },
    { userName: "Mia", roles: ["Admin"] },
  );
  const now = await db.contactConsent.findFirstOrThrow({
    where: { contactId: ana.id },
    orderBy: { recordedAt: "desc" },
  });
  assert.equal(now.status, "WITHDRAWN");
  assert.equal(now.source, "EXTERNAL");
  assert.equal(now.recordedBy, "Klaviyo");
  assert.equal(now.recordedAt.toISOString(), "2026-11-05T08:00:00.000Z");

  // Not sent back to Klaviyo as an unsubscribe from all marketing.
  fake.sent = [];
  await klaviyo.syncKlaviyoIntegration(teamId);
  assert.deepEqual(
    fake.sent.map(({ path }) => path),
    [],
  );
});

test("declining keeps the consent, and the same report is not proposed again", async () => {
  const teamId = await setUp();
  const ana = await createContact(teamId, "ana@example.org");
  await consent(teamId, ana.id, "GRANTED", "2026-11-01T10:00:00Z");
  fake.profiles = [
    {
      id: "P1",
      attributes: {
        email: "ana@example.org",
        subscriptions: {
          email: {
            marketing: {
              consent: "SUBSCRIBED",
              list_suppressions: [
                { list_id: "LIST", timestamp: "2026-11-05T08:00:00Z" },
              ],
            },
          },
        },
      },
    },
  ];
  await klaviyo.syncKlaviyoIntegration(teamId);
  const pending = await proposals.getPendingProposals(teamId, {
    roles: ["Admin"],
  });
  await proposals.resolveProposal(
    { teamId, proposalId: pending.data[0].id, decision: "decline" },
    { userName: "Mia", roles: ["Admin"] },
  );
  const again = await klaviyo.syncKlaviyoIntegration(teamId);
  assert.equal(again.withdrawalsProposed, 0);
  assert.equal(
    (await proposals.getPendingProposals(teamId, { roles: ["Admin"] })).data
      .length,
    0,
  );
  assert.equal(
    await db.contactConsent.count({
      where: { contactId: ana.id, status: "WITHDRAWN" },
    }),
    0,
  );
});

test("a permanently deleted contact is marked and unsubscribed in Klaviyo", async () => {
  const teamId = await setUp();
  const known = await createContact(teamId, "ana@example.org", {
    deletedAt: new Date(),
  });
  await db.contactEmail.create({
    data: {
      teamId,
      contactId: known.id,
      email: "ana.alias@example.org",
      kind: "ALIAS",
    },
  });
  const unknown = await createContact(teamId, "ben@example.org", {
    deletedAt: new Date(),
  });
  await contacts.permanentlyDeleteContacts(
    teamId,
    [known.id, unknown.id],
    undefined,
    ["Admin"],
  );
  // Queued until the next sync, and only then.
  assert.equal(await db.klaviyoProfileDeletion.count({ where: { teamId } }), 3);
  fake.profiles = [
    { id: "P1", attributes: { email: "ana@example.org", first_name: "Ana" } },
  ];

  const result = await klaviyo.syncKlaviyoIntegration(teamId);
  assert.equal(result.deletionsMarked, 1);
  assert.equal(result.deletionsNotInKlaviyo, 2);
  assert.equal(fake.patched.length, 1);
  assert.equal(fake.patched[0].id, "P1");
  assert.match(
    fake.patched[0].properties.crm_deleted_at,
    /^\d{4}-\d{2}-\d{2}T/,
  );
  // Only the address Klaviyo knows is unsubscribed: an unsubscribe would
  // create a profile for the others.
  assert.deepEqual(
    fake.sent.map(({ path, body }) => [
      path,
      body.data.attributes.profiles.data.map((entry) => entry.attributes.email),
    ]),
    [["/profile-subscription-bulk-delete-jobs", ["ana@example.org"]]],
  );
  // The profile itself is not imported back, and the addresses are gone.
  assert.equal(await db.contact.count({ where: { teamId } }), 0);
  assert.equal(await db.klaviyoProfileDeletion.count(), 0);
});

test("without Klaviyo switched on, no address is kept after a permanent delete", async () => {
  const teamId = await setUp();
  await db.integrationConnection.updateMany({
    where: { teamId },
    data: { isEnabled: false },
  });
  const gone = await createContact(teamId, "ana@example.org", {
    deletedAt: new Date(),
  });
  await contacts.permanentlyDeleteContacts(teamId, [gone.id], undefined, [
    "Admin",
  ]);
  assert.equal(await db.klaviyoProfileDeletion.count(), 0);
  assert.equal(await db.contactImportBlock.count(), 1);
});

test("consents are sent only once an admin switches sending on", async () => {
  const teamId = await setUp({ sendConsents: false });
  const contact = await createContact(teamId, "ana@example.org");
  await consent(teamId, contact.id, "GRANTED", "2026-01-01T00:00:00Z");

  const off = await klaviyo.syncKlaviyoIntegration(teamId);
  assert.equal(fake.sent.length, 0);
  assert.equal(off.consentsSent, 0);
  assert.match(off.consentsWaiting.join(" "), /switched off/);
  assert.equal(await db.klaviyoConsentSync.count(), 0);

  // Saving encrypts the key: a throwaway encryption key for this test.
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEYS = `test=${Buffer.alloc(32, 1).toString("base64")}`;
  try {
    await klaviyo.saveKlaviyoIntegration({ teamId, sendConsents: true });
    const on = await klaviyo.syncKlaviyoIntegration(teamId);
    assert.equal(on.consentsSent, 1);
    assert.deepEqual(
      fake.sent.map(({ path }) => path),
      ["/profile-subscription-bulk-create-jobs"],
    );
  } finally {
    delete process.env.INTEGRATION_SECRET_ENCRYPTION_KEYS;
  }
});

test("switching off a Klaviyo that was never connected needs no key", async () => {
  const team = await db.teams.create({
    data: { name: "No Klaviyo", email: `none-${Date.now()}@example.org` },
  });
  assert.equal(
    await klaviyo.saveKlaviyoIntegration({ teamId: team.id, isEnabled: false }),
    null,
  );
  await assert.rejects(
    klaviyo.saveKlaviyoIntegration({ teamId: team.id, isEnabled: true }),
    /API key is required/,
  );
  assert.equal(await db.integrationConnection.count(), 0);
});
