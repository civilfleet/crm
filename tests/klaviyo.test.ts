import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  parseRetryAfter,
  requestKlaviyo,
  subscribeKlaviyoProfiles,
  unsubscribeKlaviyoProfiles,
} from "@/lib/klaviyo";
import {
  eventToEngagement,
  planConsentPush,
  profileListLeftAt,
  profileMarketingWithdrawnAt,
  profileToIntake,
} from "@/lib/klaviyo-mapping";

/*
  Klaviyo translation and API calls (docs/DATA_RULES.md, "Klaviyo"). The
  sync against a real database: tests/db/klaviyo-sync.test.ts.
*/

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const profile = (attributes: Record<string, unknown>) => ({
  id: "P1",
  attributes,
});

test("a profile without a name leaves the name empty, never the address", () => {
  assert.deepEqual(
    profileToIntake(
      profile({ email: " Ana@Example.org ", location: { region: "Sicily" } }),
    ),
    {
      email: "ana@example.org",
      name: "",
      createName: "ana@example.org",
      phone: undefined,
      // A region is not a city.
      city: undefined,
    },
  );
  assert.equal(
    profileToIntake(
      profile({ email: "a@x.org", first_name: "Ana", last_name: " Rossi " }),
    )?.name,
    "Ana Rossi",
  );
  assert.equal(profileToIntake(profile({ phone_number: "+391234" })), null);
});

test("unsubscribes and spam complaints withdraw; bounces do not", () => {
  const withMarketing = (marketing: unknown) =>
    profile({ email: "a@x.org", subscriptions: { email: { marketing } } });

  assert.equal(
    profileMarketingWithdrawnAt(withMarketing({ consent: "SUBSCRIBED" })),
    null,
  );
  assert.deepEqual(
    profileMarketingWithdrawnAt(
      withMarketing({
        consent: "UNSUBSCRIBED",
        last_updated: "2026-11-01T10:00:00+00:00",
      }),
    ),
    new Date("2026-11-01T10:00:00Z"),
  );
  assert.deepEqual(
    profileMarketingWithdrawnAt(
      withMarketing({
        consent: "SUBSCRIBED",
        suppression: [
          { reason: "HARD_BOUNCE", timestamp: "2026-11-05T00:00:00Z" },
          { reason: "SPAM_COMPLAINT", timestamp: "2026-11-03T00:00:00Z" },
        ],
      }),
    ),
    new Date("2026-11-03T00:00:00Z"),
  );
  assert.equal(
    profileMarketingWithdrawnAt(
      withMarketing({
        consent: "SUBSCRIBED",
        suppression: [
          { reason: "HARD_BOUNCE", timestamp: "2026-11-05T00:00:00Z" },
        ],
      }),
    ),
    null,
  );
});

const event = (id: string, properties: Record<string, unknown>) => ({
  id,
  attributes: {
    datetime: "2026-11-10T08:00:00+00:00",
    event_properties: properties,
  },
});

test("e-mail events become short timeline entries; opens and clicks collapse per e-mail", () => {
  const properties = {
    Subject: "November update",
    "Campaign Name": "Newsletter 11/26",
    $message: "MSG1",
  };
  const received = eventToEngagement(
    "Received Email",
    event("E1", properties),
    "P1",
    "ana@example.org",
  );
  assert.equal(received?.externalId, "E1");
  assert.equal(received?.direction, "OUTBOUND");
  assert.equal(received?.subject, "November update");
  assert.equal(
    received?.message,
    [
      "Received “November update” (sent through Klaviyo).",
      "",
      "Recipient: ana@example.org",
      "Metric: Received Email",
      "Campaign: Newsletter 11/26",
      "Klaviyo: https://www.klaviyo.com/profile/P1",
    ].join("\n"),
  );

  const firstOpen = eventToEngagement(
    "Opened Email",
    event("E2", properties),
    "P1",
    "ana@example.org",
  );
  const secondOpen = eventToEngagement(
    "Opened Email",
    event("E3", properties),
    "P1",
    "ana@example.org",
  );
  assert.equal(firstOpen?.externalId, "opened:MSG1:P1");
  assert.equal(secondOpen?.externalId, firstOpen?.externalId);
  assert.equal(firstOpen?.firstOnly, true);
  assert.equal(firstOpen?.direction, "INBOUND");
  // Another person's open of the same e-mail is their own entry.
  assert.equal(
    eventToEngagement(
      "Opened Email",
      event("E4", properties),
      "P2",
      "ana@example.org",
    )?.externalId,
    "opened:MSG1:P2",
  );

  const click = eventToEngagement(
    "Clicked Email",
    event("E5", { ...properties, URL: "https://example.org/donate" }),
    "P1",
    "ana@example.org",
  );
  assert.match(click?.message ?? "", /https:\/\/example\.org\/donate/);

  // Without a message id an open stands alone.
  assert.equal(
    eventToEngagement(
      "Opened Email",
      event("E6", { Subject: "Hi" }),
      "P1",
      "ana@example.org",
    )?.externalId,
    "E6",
  );
  assert.equal(
    eventToEngagement(
      "Received Email",
      { id: "E7", attributes: {} },
      "P1",
      "ana@example.org",
    ),
    null,
  );
});

const candidate = (overrides = {}) => ({
  id: "C1",
  contactId: "K1",
  status: "GRANTED" as const,
  source: "FORM" as const,
  recordedBy: null,
  recordedAt: new Date("2026-11-01T00:00:00Z"),
  ...overrides,
});
const context = (overrides = {}) => ({
  latestConsentId: "C1",
  email: "ana@example.org",
  contactInTrash: false,
  listId: "LIST",
  ...overrides,
});

test("only the consent that holds now is sent, never one from Klaviyo", () => {
  assert.deepEqual(planConsentPush(candidate(), context()), {
    kind: "subscribe",
    email: "ana@example.org",
    consentedAt: new Date("2026-11-01T00:00:00Z"),
  });
  assert.deepEqual(
    planConsentPush(candidate({ status: "WITHDRAWN" }), context()),
    { kind: "unsubscribe", email: "ana@example.org" },
  );
  assert.equal(
    planConsentPush(candidate(), context({ latestConsentId: "C2" })).kind,
    "skip",
  );
  assert.equal(
    planConsentPush(
      candidate({
        status: "WITHDRAWN",
        source: "EXTERNAL",
        recordedBy: "Klaviyo",
      }),
      context(),
    ).kind,
    "skip",
  );
  assert.equal(
    planConsentPush(candidate(), context({ email: null })).kind,
    "skip",
  );
  // A grant waits for a list and for the contact to leave the trash; a
  // withdrawal never waits.
  assert.equal(
    planConsentPush(candidate(), context({ listId: null })).kind,
    "wait",
  );
  assert.equal(
    planConsentPush(candidate(), context({ contactInTrash: true })).kind,
    "wait",
  );
  assert.equal(
    planConsentPush(
      candidate({ status: "WITHDRAWN" }),
      context({ listId: null, contactInTrash: true }),
    ).kind,
    "unsubscribe",
  );
});

test("a rate-limited request waits as Klaviyo asks and tries again", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    if (calls.length === 1) {
      return new Response("{}", {
        status: 429,
        headers: { "Retry-After": "0.01" },
      });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;

  const response = await requestKlaviyo("key", "/profiles");
  assert.equal(calls.length, 2);
  assert.deepEqual(response?.data, []);
  assert.equal(parseRetryAfter(null), 5);
  assert.equal(parseRetryAfter("600"), 60);
});

test("other failures throw with Klaviyo's message", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ errors: [{ detail: "Invalid API key" }] }), {
      status: 401,
    })) as typeof fetch;
  await assert.rejects(
    requestKlaviyo("key", "/profiles"),
    /Klaviyo request failed \(401\): Invalid API key/,
  );
});

test("consents are sent with their time; withdrawals unsubscribe from all marketing", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return new Response(null, { status: 202 });
  }) as typeof fetch;

  await subscribeKlaviyoProfiles("key", "LIST", [
    { email: "ana@example.org", consentedAt: new Date("2026-11-01T09:30:00Z") },
  ]);
  await unsubscribeKlaviyoProfiles("key", ["ben@example.org"]);

  assert.equal(
    requests[0].url,
    "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs",
  );
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        custom_source: "CRM",
        historical_import: true,
        profiles: {
          data: [
            {
              type: "profile",
              attributes: {
                email: "ana@example.org",
                subscriptions: {
                  email: {
                    marketing: {
                      consent: "SUBSCRIBED",
                      consented_at: "2026-11-01T09:30:00.000Z",
                    },
                  },
                },
              },
            },
          ],
        },
      },
      relationships: { list: { data: { type: "list", id: "LIST" } } },
    },
  });
  assert.equal(
    requests[1].url,
    "https://a.klaviyo.com/api/profile-subscription-bulk-delete-jobs",
  );
  const unsubscribe = JSON.parse(String(requests[1].init.body));
  assert.equal(unsubscribe.data.relationships, undefined);
  assert.deepEqual(
    unsubscribe.data.attributes.profiles.data[0].attributes.subscriptions,
    { email: { marketing: { consent: "UNSUBSCRIBED" } } },
  );
});

test("leaving only the team's list is found, other lists are not", () => {
  const leaving = profile({
    email: "a@x.org",
    subscriptions: {
      email: {
        marketing: {
          consent: "SUBSCRIBED",
          list_suppressions: [
            {
              list_id: "OTHER",
              reason: "UNSUBSCRIBE",
              timestamp: "2026-11-09T00:00:00Z",
            },
            {
              list_id: "LIST",
              reason: "UNSUBSCRIBE",
              timestamp: "2026-11-08T00:00:00Z",
            },
          ],
        },
      },
    },
  });
  assert.deepEqual(
    profileListLeftAt(leaving, "LIST"),
    new Date("2026-11-08T00:00:00Z"),
  );
  assert.equal(profileListLeftAt(leaving, "THIRD"), null);
  // Leaving one list is not a withdrawal of all marketing.
  assert.equal(profileMarketingWithdrawnAt(leaving), null);
});
