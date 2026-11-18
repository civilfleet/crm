import assert from "node:assert/strict";
import test from "node:test";
import * as registrationModule from "../src/lib/public-events/registration";
import * as confirmationModule from "../src/lib/public-forms/confirmation";
import * as publishedFormModule from "../src/lib/public-forms/published-form";
import * as submissionModule from "../src/lib/public-forms/submission";
import {
  FORM_SUBMISSION_FAILURE_SUBJECT,
  FORM_SUBMISSION_MAX_BYTES,
  formatFormAnswers,
  formSubmissionMessage,
  formSubmissionPayload,
} from "../src/lib/public-forms/submission";
import * as verifyModule from "../src/lib/public-forms/verify";
import {
  handleMessage,
  type IntakeJetStream,
  type IntakePipeline,
} from "../src/lib/public-intake/consumer";
import { loadModule } from "./helpers/load-module";

const TEAM_ID = "a10957f3-9d42-4b67-b31c-8bed001777ff";
const SUBMISSION_ID = "11111111-1111-4111-8111-111111111111";

const validPayload = () => ({
  version: 1,
  teamId: TEAM_ID,
  form: {
    id: "abc123documentid",
    title: "Volunteer interest",
    revision: "2026-11-10T09:00:00.000Z",
    locale: "de",
  },
  page: "/de/mitmachen",
  submittedAt: "2026-11-12T10:00:00.000Z",
  contact: {
    email: "  Person@Example.ORG ",
    name: "Synthetic Person",
    phone: "+49 30 000000",
    postalCode: "10115",
    city: "Berlin",
    country: "Germany",
  },
  answers: [
    {
      id: "motivation",
      label: "Why do you want to help?",
      type: "textarea",
      value: "Because.",
    },
    {
      id: "skills",
      label: "Skills",
      type: "multiple",
      value: ["medic", "cook"],
      display: ["Medic", "Cook"],
    },
    { id: "hours", label: "Hours per week", type: "number", value: 5 },
    { id: "privacy", label: "I agree", type: "consent", value: true },
  ],
});

test("form payload accepts the contract shape and normalizes contact email", () => {
  const parsed = formSubmissionPayload.parse(validPayload());
  assert.equal(parsed.contact.email, "person@example.org");
  assert.equal(parsed.answers.length, 4);
  const minimal = formSubmissionPayload.parse({
    ...validPayload(),
    page: undefined,
    contact: { email: "x@example.org", phone: "" },
    answers: [],
  });
  assert.equal(minimal.contact.phone, undefined);
  assert.equal(minimal.page, undefined);
  assert.equal(
    formatFormAnswers(parsed.answers),
    "Why do you want to help?: Because.\nSkills: Medic, Cook\nHours per week: 5\nI agree: Yes",
  );
  assert.ok(
    formSubmissionMessage.safeParse({
      version: 1,
      submissionId: SUBMISSION_ID,
      receivedAt: "2026-11-12T10:00:01.000Z",
      submission: parsed,
    }).success,
  );
});

test("form payload rejects unknown keys, missing email and out-of-contract values", () => {
  const reject = (mutate: (payload: Record<string, unknown>) => void) => {
    const payload = validPayload() as unknown as Record<string, unknown>;
    mutate(payload);
    assert.equal(formSubmissionPayload.safeParse(payload).success, false);
  };
  const answers = (payload: Record<string, unknown>) =>
    payload.answers as Record<string, unknown>[];
  const contact = (payload: Record<string, unknown>) =>
    payload.contact as Record<string, unknown>;
  reject((p) => {
    p.extra = true;
  });
  reject((p) => {
    (p.form as Record<string, unknown>).extra = true;
  });
  reject((p) => {
    contact(p).extra = "x";
  });
  reject((p) => {
    answers(p)[0].extra = "x";
  });
  reject((p) => {
    delete contact(p).email;
  });
  reject((p) => {
    contact(p).email = "not-an-email";
  });
  reject((p) => {
    contact(p).email = `${"a".repeat(250)}@example.org`;
  });
  reject((p) => {
    contact(p).name = "";
  });
  reject((p) => {
    contact(p).phone = "1".repeat(81);
  });
  reject((p) => {
    contact(p).postalCode = "1".repeat(33);
  });
  reject((p) => {
    p.version = 2;
  });
  reject((p) => {
    p.teamId = "team";
  });
  reject((p) => {
    p.page = "https://evil.example/";
  });
  reject((p) => {
    p.page = `/${"a".repeat(2048)}`;
  });
  reject((p) => {
    p.submittedAt = "yesterday";
  });
  reject((p) => {
    (p.form as Record<string, unknown>).id = "x".repeat(65);
  });
  reject((p) => {
    (p.form as Record<string, unknown>).locale = "d";
  });
  reject((p) => {
    answers(p)[0].id = "1starts-with-digit";
  });
  reject((p) => {
    answers(p)[0].type = "file";
  });
  reject((p) => {
    answers(p)[0].value = "x".repeat(10001);
  });
  reject((p) => {
    answers(p)[0].value = { nested: true };
  });
  reject((p) => {
    answers(p)[1].value = Array.from({ length: 101 }, () => "a");
  });
  reject((p) => {
    answers(p)[1].value = ["x".repeat(81)];
  });
  reject((p) => {
    answers(p)[1].display = ["x".repeat(501)];
  });
  reject((p) => {
    p.answers = Array.from({ length: 101 }, (_, index) => ({
      id: `q${index}`,
      label: "Q",
      type: "text",
      value: "a",
    }));
  });
  // A maximal valid body stays within the bridge cap and the 96 KiB message size.
  assert.equal(FORM_SUBMISSION_MAX_BYTES, 65536);
});

type Row = Record<string, unknown>;

function formHarness(options: { enabled?: boolean } = {}) {
  let state = {
    teams: [{ id: TEAM_ID, publicFormsEnabled: options.enabled ?? true }],
    contacts: [] as Row[],
    emails: [] as Row[],
    submissions: [] as Row[],
    engagements: [] as Row[],
    consents: [] as Row[],
    changeLogs: [] as Row[],
    proposals: [] as Row[],
  };
  let ids = 0;
  const withEmails = (contact: Row | undefined) =>
    contact
      ? {
          ...contact,
          emails: state.emails.filter((e) => e.contactId === contact.id),
        }
      : null;
  const tx = {
    teams: {
      findFirst: async ({ where }: { where: Row }) =>
        state.teams.find(
          (team) =>
            team.id === where.id &&
            team.publicFormsEnabled === where.publicFormsEnabled,
        ) ?? null,
    },
    formSubmission: {
      findUnique: async ({ where }: { where: Row }) =>
        state.submissions.find((s) => s.submissionId === where.submissionId) ??
        null,
      create: async ({ data }: { data: Row }) => {
        if (state.submissions.some((s) => s.submissionId === data.submissionId))
          throw Object.assign(new Error("unique"), { code: "P2002" });
        const row = { id: `submission-${++ids}`, ...data };
        state.submissions.push(row);
        return row;
      },
    },
    contact: {
      findUnique: async ({ where }: { where: Row }) =>
        withEmails(state.contacts.find((c) => c.id === where.id)),
      findFirst: async ({ where }: { where: Row }) =>
        withEmails(
          state.contacts.find(
            (c) =>
              c.teamId === where.teamId &&
              c.phone === where.phone &&
              !c.deletedAt,
          ),
        ),
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const contact = state.contacts.find((c) => c.id === where.id);
        assert.ok(contact);
        Object.assign(contact, data);
        return withEmails(contact);
      },
      create: async ({ data }: { data: Row }) => {
        const { emails, ...fields } = data as Row & {
          emails: { create: Row[] };
        };
        const contact = { id: `contact-${++ids}`, ...fields };
        state.contacts.push(contact);
        for (const email of emails.create)
          state.emails.push({ ...email, contactId: contact.id });
        return withEmails(contact);
      },
    },
    contactEmail: {
      // Identity addresses (primary or alias) of the team, trash included.
      findFirst: async ({ where }: { where: Row }) => {
        const match = state.emails.find(
          (e) =>
            e.teamId === where.teamId &&
            e.email === where.email &&
            (e.kind === "PRIMARY" || e.kind === "ALIAS"),
        );
        const contact = match
          ? state.contacts.find((c) => c.id === match.contactId)
          : undefined;
        return contact
          ? {
              contact: { id: contact.id, deletedAt: contact.deletedAt ?? null },
            }
          : null;
      },
      upsert: async ({ create }: { create: Row }) => {
        state.emails.push(create);
        return create;
      },
    },
    // Contacts with the same phone (last eight digits), for the duplicate note.
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      const [teamId, excludeId, , tail] = values as string[];
      return state.contacts
        .filter(
          (c) =>
            c.teamId === teamId &&
            c.id !== excludeId &&
            !c.deletedAt &&
            typeof c.phone === "string" &&
            c.phone.replace(/\D/g, "").endsWith(tail),
        )
        .map((c) => ({ id: c.id }));
    },
    contactEngagement: {
      create: async ({ data }: { data: Row }) => {
        state.engagements.push(data);
        return data;
      },
    },
    contactConsent: {
      createMany: async ({ data }: { data: Row[] }) => {
        state.consents.push(...data);
        return { count: data.length };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      const before = structuredClone(state);
      try {
        return await callback(tx);
      } catch (error) {
        state = before;
        throw error;
      }
    },
    formSubmission: tx.formSubmission,
    $disconnect: async () => {},
  };
  const types = {
    ContactEmailKind: { PRIMARY: "PRIMARY", ALIAS: "ALIAS" },
    EngagementDirection: { INBOUND: "INBOUND", OUTBOUND: "OUTBOUND" },
    EngagementSource: { FORM: "FORM" },
  };
  const intake = loadModule("src/services/contact-intake/index.ts", {
    "@/services/contact-change-logs": {
      logContactCreation: async (contactId: string, ...rest: unknown[]) => {
        state.changeLogs.push({ contactId, action: "CREATED", meta: rest[3] });
      },
      logFieldUpdate: async (contactId: string, field: string) => {
        state.changeLogs.push({ contactId, action: "UPDATED", field });
      },
      // One proposal per submission, as the real helper records it.
      proposeFieldChange: async (_tx: unknown, proposal: Row) => {
        state.proposals.push(proposal);
        return true;
      },
    },
    "@/services/contacts": {
      findContactByIdentityEmail: async (teamId: string, email: string) => {
        const match = state.emails.find(
          (e) =>
            e.teamId === teamId &&
            e.email === email &&
            (e.kind === "PRIMARY" || e.kind === "ALIAS"),
        );
        return match ? { id: match.contactId } : null;
      },
    },
    "@/types": types,
  });
  const service = loadModule<{
    createFormSubmission: (
      input: unknown,
      options?: { readForm?: (id: string, locale: string) => Promise<unknown> },
    ) => Promise<Row>;
    FormSubmissionRejectedError: new () => Error;
  }>("src/services/form-submissions/index.ts", {
    "@/lib/prisma": prisma,
    "@/lib/public-forms/submission": submissionModule,
    "@/lib/public-forms/verify": verifyModule,
    "@/lib/public-forms/published-form": publishedFormModule,
    "@/services/contact-intake": intake,
    "@/types": types,
  });
  return { service, prisma, state: () => state };
}

const message = (overrides: Row = {}, submissionId = SUBMISSION_ID) =>
  formSubmissionMessage.parse({
    version: 1,
    submissionId,
    receivedAt: "2026-11-12T10:00:01.000Z",
    submission: { ...validPayload(), ...overrides },
  });

test("new contact is created with contact block and a FORM engagement in one transaction", async () => {
  const harness = formHarness();
  const saved = await harness.service.createFormSubmission(message());
  const state = harness.state();
  assert.equal(state.contacts.length, 1);
  assert.deepEqual(
    {
      name: state.contacts[0].name,
      phone: state.contacts[0].phone,
      postalCode: state.contacts[0].postalCode,
      city: state.contacts[0].city,
      country: state.contacts[0].country,
    },
    {
      name: "Synthetic Person",
      phone: "+49 30 000000",
      postalCode: "10115",
      city: "Berlin",
      country: "Germany",
    },
  );
  assert.equal(state.emails[0].email, "person@example.org");
  assert.equal(state.emails[0].kind, "PRIMARY");
  assert.equal(saved.submissionId, SUBMISSION_ID);
  assert.equal(saved.contactId, state.contacts[0].id);
  assert.equal(saved.formId, "abc123documentid");
  assert.equal(saved.locale, "de");
  assert.equal(saved.page, "/de/mitmachen");
  // What was submitted for the contact stays with the submission.
  assert.deepEqual(
    (saved.contactAnswers as Array<{ field: string; value: string }>).map(
      ({ field, value }) => [field, value],
    ),
    [
      ["name", "Synthetic Person"],
      ["email", "person@example.org"],
      ["phone", "+49 30 000000"],
      ["postalCode", "10115"],
      ["city", "Berlin"],
      ["country", "Germany"],
    ],
  );
  assert.ok(saved.submittedAt instanceof Date);
  assert.equal(state.engagements.length, 1);
  const engagement = state.engagements[0];
  assert.equal(engagement.direction, "INBOUND");
  assert.equal(engagement.source, "FORM");
  assert.equal(engagement.subject, "Form: Volunteer interest");
  assert.equal(engagement.externalId, SUBMISSION_ID);
  assert.equal(engagement.externalSource, "website-form");
  assert.equal(engagement.teamId, TEAM_ID);
  assert.equal(
    (engagement.engagedAt as Date).toISOString(),
    "2026-11-12T10:00:01.000Z",
  );
  assert.match(String(engagement.message), /^Why do you want to help\?: /);
  assert.equal(state.changeLogs[0].action, "CREATED");

  const nameless = formHarness();
  await nameless.service.createFormSubmission(
    message({ contact: { email: "anon@example.org" } }),
  );
  assert.equal(nameless.state().contacts[0].name, "anon@example.org");
});

test("a consent answer may carry a purpose; other answers may not", () => {
  const payload = validPayload();
  payload.answers.push({
    id: "updates",
    label: "I want updates",
    type: "consent",
    value: true,
    purpose: "marketing",
  } as (typeof payload.answers)[number]);
  assert.equal(
    formSubmissionPayload.parse(payload).answers.at(-1)?.purpose,
    "marketing",
  );

  const unknown = structuredClone(payload) as Row & { answers: Row[] };
  unknown.answers[unknown.answers.length - 1].purpose = "anything";
  assert.equal(formSubmissionPayload.safeParse(unknown).success, false);

  const onText = structuredClone(payload) as Row & { answers: Row[] };
  onText.answers[0].purpose = "marketing";
  assert.equal(formSubmissionPayload.safeParse(onText).success, false);
});

test("ticked consents with a purpose are recorded; others are not", async () => {
  const harness = formHarness();
  const answers = [
    ...validPayload().answers,
    {
      id: "updates",
      label: "Voglio ricevere aggiornamenti da Sea-Watch",
      type: "consent",
      value: true,
      purpose: "marketing",
    },
    {
      id: "later",
      label: "Unticked",
      type: "consent",
      value: false,
      purpose: "marketing",
    },
  ];
  await harness.service.createFormSubmission(message({ answers }));
  const state = harness.state();
  // The privacy consent has no purpose and stays an answer only.
  assert.equal(state.consents.length, 1);
  const consent = state.consents[0];
  assert.equal(consent.purpose, "marketing");
  // Pending until the address is confirmed; the submission asks for it.
  assert.equal(consent.status, "PENDING");
  assert.equal(state.submissions[0].confirmationRequested, true);
  assert.equal(state.submissions[0].email, "person@example.org");
  assert.equal(state.submissions[0].createdContact, true);
  assert.equal(consent.source, "FORM");
  assert.equal(consent.wording, "Voglio ricevere aggiornamenti da Sea-Watch");
  assert.equal(consent.contactId, state.contacts[0].id);
  assert.equal(consent.submissionId, SUBMISSION_ID);
  assert.equal(consent.locale, "de");
  assert.equal(
    (consent.recordedAt as Date).toISOString(),
    "2026-11-12T10:00:00.000Z",
  );
});

test("confirmation is asked for by the form, or by a marketing consent", async () => {
  const asked = formHarness();
  await asked.service.createFormSubmission(
    message({
      form: { ...validPayload().form, confirmation: "email" },
    }),
  );
  assert.equal(asked.state().submissions[0].confirmationRequested, true);

  const notAsked = formHarness();
  await notAsked.service.createFormSubmission(message());
  assert.equal(notAsked.state().submissions[0].confirmationRequested, false);
  assert.equal(notAsked.state().consents.length, 0);
});

const publishedForm = (overrides: Row = {}) => ({
  version: 1,
  formId: "abc123documentid",
  locale: "de",
  revision: "2026-11-10T09:00:00.000Z",
  teamId: TEAM_ID,
  title: "Volunteer interest",
  confirmation: null,
  questions: [
    {
      id: "full-name",
      label: "Nome completo",
      type: "text",
      required: true,
      contactField: "name",
    },
    { id: "motivation", label: "Warum?", type: "textarea", required: false },
    {
      id: "updates",
      label: "Updates von Sea-Watch",
      type: "consent",
      required: false,
      purpose: "marketing",
    },
  ],
  ...overrides,
});
const withMarketing = () => [
  ...validPayload().answers,
  {
    id: "updates",
    label: "Something else",
    type: "consent",
    value: true,
    purpose: "marketing",
  },
];

test("checked against the published form: wording from the file, result stored", async () => {
  const harness = formHarness();
  await harness.service.createFormSubmission(
    message({ answers: withMarketing() }),
    { readForm: async () => publishedForm() },
  );
  const state = harness.state();
  assert.equal(state.consents[0].wording, "Updates von Sea-Watch");
  // Labels as the form asked them; fields without a question keep a default.
  const labels = Object.fromEntries(
    (
      state.submissions[0].contactAnswers as Array<{
        field: string;
        label: string;
      }>
    ).map(({ field, label }) => [field, label]),
  );
  assert.equal(labels.name, "Nome completo");
  assert.equal(labels.city, "City");
  const verification = state.submissions[0].verification as Row;
  // The sample answers include questions the file lacks.
  assert.equal(verification.status, "mismatch");
});

test("a purpose the published form lacks records no consent", async () => {
  const harness = formHarness();
  await harness.service.createFormSubmission(
    message({ answers: withMarketing() }),
    {
      readForm: async () =>
        publishedForm({
          questions: [
            {
              id: "updates",
              label: "Updates",
              type: "consent",
              required: false,
            },
          ],
        }),
    },
  );
  assert.equal(harness.state().consents.length, 0);
  assert.equal(harness.state().submissions[0].confirmationRequested, false);
});

test("a form published for another team is refused; an unreachable site retries", async () => {
  const foreign = formHarness();
  await assert.rejects(
    foreign.service.createFormSubmission(message(), {
      readForm: async () =>
        publishedForm({ teamId: "22222222-2222-4222-8222-222222222222" }),
    }),
    (error: Error) => error.name === "FormSubmissionRejectedError",
  );
  assert.equal(foreign.state().submissions.length, 0);

  const down = formHarness();
  await assert.rejects(
    down.service.createFormSubmission(message(), {
      readForm: async () => {
        throw new publishedFormModule.PublishedFormUnavailableError("down");
      },
    }),
    (error: Error) => error.name === "PublishedFormUnavailableError",
  );
  assert.equal(down.state().submissions.length, 0);
});

test("existing contact only gets empty fields filled, never overwritten", async () => {
  const harness = formHarness();
  const state = harness.state();
  state.contacts.push({
    id: "existing",
    teamId: TEAM_ID,
    name: "Kept Name",
    phone: "+49 111",
    postalCode: null,
    city: "Hamburg",
    country: null,
  });
  state.emails.push({
    teamId: TEAM_ID,
    contactId: "existing",
    email: "person@example.org",
    kind: "PRIMARY",
  });
  await harness.service.createFormSubmission(message());
  const after = harness.state();
  assert.equal(after.contacts.length, 1);
  assert.deepEqual(
    {
      name: after.contacts[0].name,
      phone: after.contacts[0].phone,
      postalCode: after.contacts[0].postalCode,
      city: after.contacts[0].city,
      country: after.contacts[0].country,
    },
    {
      name: "Kept Name",
      phone: "+49 111",
      postalCode: "10115",
      city: "Hamburg",
      country: "Germany",
    },
  );
  assert.deepEqual(
    after.changeLogs.map((log) => log.field),
    ["postalCode", "country"],
  );
  // Differing non-empty values are proposed, not applied.
  assert.deepEqual(
    after.proposals.map((p) => [p.fieldName, p.oldValue, p.newValue]),
    [
      ["name", "Kept Name", "Synthetic Person"],
      ["phone", "+49 111", "+49 30 000000"],
      ["city", "Hamburg", "Berlin"],
    ],
  );
  assert.equal(after.proposals[0].userName, "Website form");
  assert.equal(
    (after.proposals[0].metadata as Row).submissionId,
    SUBMISSION_ID,
  );
  assert.equal(after.submissions[0].contactId, "existing");
  assert.equal(after.engagements[0].contactId, "existing");
  assert.match(
    String(after.engagements[0].message),
    /3 contact changes pending review/,
  );

  // A phone number alone never picks a contact: a new one is made, and the
  // one with the same number is noted as a possible duplicate.
  const byPhone = formHarness();
  byPhone.state().contacts.push({
    id: "phone-match",
    teamId: TEAM_ID,
    name: "Someone",
    // The national form of the submitted "+49 30 000000".
    phone: "030 000000",
  });
  await byPhone.service.createFormSubmission(message());
  const phoneState = byPhone.state();
  assert.equal(phoneState.contacts.length, 2);
  assert.equal(phoneState.contacts[0].name, "Someone");
  assert.ok(
    !phoneState.emails.some((e) => e.contactId === "phone-match"),
    "nothing attached to the contact with the same number",
  );
  const creation = phoneState.changeLogs.find(
    (log) => log.action === "CREATED",
  );
  assert.deepEqual((creation?.meta as Row).possibleDuplicates, [
    { contactId: "phone-match", reason: "phone" },
  ]);
});

test("formatting-only differences neither fill nor propose", async () => {
  const harness = formHarness();
  const state = harness.state();
  state.contacts.push({
    id: "existing",
    teamId: TEAM_ID,
    name: "synthetic   PERSON",
    phone: "+4930-000000",
    postalCode: "10 115",
    city: " berlin ",
    country: "GERMANY",
  });
  state.emails.push({
    teamId: TEAM_ID,
    contactId: "existing",
    email: "person@example.org",
    kind: "PRIMARY",
  });
  await harness.service.createFormSubmission(message());
  const after = harness.state();
  assert.deepEqual(after.proposals, []);
  assert.deepEqual(after.changeLogs, []);
  assert.equal(after.contacts[0].name, "synthetic   PERSON");
  assert.doesNotMatch(String(after.engagements[0].message), /pending review/);
});

test("an address in the trash brings its contact back", async () => {
  const harness = formHarness();
  const state = harness.state();
  state.contacts.push({
    id: "trashed",
    teamId: TEAM_ID,
    name: "Synthetic Person",
    deletedAt: new Date("2026-10-01T00:00:00Z"),
  });
  state.emails.push({
    teamId: TEAM_ID,
    contactId: "trashed",
    email: "person@example.org",
    kind: "PRIMARY",
  });
  await harness.service.createFormSubmission(message());
  const after = harness.state();
  assert.equal(after.contacts.length, 1);
  assert.equal(after.contacts[0].deletedAt, null);
  assert.equal(after.submissions[0].contactId, "trashed");
  assert.ok(after.changeLogs.some((log) => log.field === "deletedAt"));
});

test("each submission records its own proposal, even for the same value", async () => {
  const harness = formHarness();
  const state = harness.state();
  state.contacts.push({
    id: "existing",
    teamId: TEAM_ID,
    name: "Synthetic Person",
    city: "Hamburg",
  });
  state.emails.push({
    teamId: TEAM_ID,
    contactId: "existing",
    email: "person@example.org",
    kind: "PRIMARY",
  });
  await harness.service.createFormSubmission(message());
  await harness.service.createFormSubmission(
    message({}, "22222222-2222-4222-8222-222222222222"),
  );
  const cities = harness
    .state()
    .proposals.filter((proposal) => proposal.fieldName === "city");
  assert.equal(cities.length, 2);
  assert.deepEqual(
    cities.map((proposal) => (proposal.metadata as Row).submissionId),
    [SUBMISSION_ID, "22222222-2222-4222-8222-222222222222"],
  );
});

test("duplicate submissionId is idempotent", async () => {
  const harness = formHarness();
  const first = await harness.service.createFormSubmission(message());
  const second = await harness.service.createFormSubmission(
    message({ answers: [] }),
  );
  assert.deepEqual(second, first);
  const state = harness.state();
  assert.equal(state.submissions.length, 1);
  assert.equal(state.engagements.length, 1);
  assert.equal(state.contacts.length, 1);
});

class KnownRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** The real form pipeline on the shared intake runner, with harness boundaries. */
function formPipeline(
  harness: ReturnType<typeof formHarness>,
  create?: (input: unknown) => Promise<unknown>,
) {
  return loadModule<{
    formSubmissionPipeline: IntakePipeline<unknown>;
  }>("src/lib/public-intake/pipelines.ts", {
    "@/lib/prisma": harness.prisma,
    "@/lib/public-events/registration": registrationModule,
    "@/lib/public-forms/submission": submissionModule,
    "@/lib/public-forms/verify": verifyModule,
    "@/lib/public-forms/published-form": publishedFormModule,
    "@/services/form-submissions": {
      ...harness.service,
      createFormSubmission: create ?? harness.service.createFormSubmission,
    },
    "@/services/events": {},
    "@/lib/public-forms/confirmation": confirmationModule,
    "@/services/form-confirmations": {},
  }).formSubmissionPipeline;
}

async function runConsumer(
  deliveries: Array<{ data: unknown; deliveryCount?: number }>,
  options: {
    enabled?: boolean;
    create?: (
      input: unknown,
      harness: ReturnType<typeof formHarness>,
    ) => Promise<unknown>;
  } = {},
) {
  const harness = formHarness({ enabled: options.enabled });
  const create = options.create;
  const pipeline = formPipeline(
    harness,
    create && ((input) => create(input, harness)),
  );
  const outcomes: string[] = [];
  const published: Array<{ subject: string; msgID?: string }> = [];
  const js = {
    publish: async (
      subject: string,
      _data: unknown,
      opts?: { msgID?: string },
    ) => {
      published.push({ subject, msgID: opts?.msgID });
    },
    consumers: { get: async () => assert.fail("not used") },
  } as unknown as IntakeJetStream;
  const logger = { log: () => {}, error: () => {} };
  for (const [index, delivery] of deliveries.entries())
    await handleMessage(
      js,
      pipeline,
      {
        data: new TextEncoder().encode(JSON.stringify(delivery.data)),
        json: () => delivery.data,
        working: () => {},
        ack: () => outcomes.push(`ack:${index}`),
        nak: (delay?: number) => outcomes.push(`nak:${index}:${delay}`),
        info: {
          deliveryCount: delivery.deliveryCount ?? 1,
          streamSequence: index,
        },
      },
      logger,
    );
  return { outcomes, published, state: harness.state() };
}

test("consumer acks valid submissions once and is idempotent on redelivery", async () => {
  const envelope = message();
  const result = await runConsumer([{ data: envelope }, { data: envelope }]);
  assert.deepEqual(result.outcomes, ["ack:0", "ack:1"]);
  assert.deepEqual(result.published, []);
  assert.equal(result.state.submissions.length, 1);
  assert.equal(result.state.engagements.length, 1);
  assert.equal(result.state.engagements[0].externalId, SUBMISSION_ID);
});

test("consumer moves rejected and poison messages to the failed subject before ack", async () => {
  const rejected = await runConsumer([{ data: message() }], {
    enabled: false,
  });
  assert.deepEqual(rejected.outcomes, ["ack:0"]);
  assert.deepEqual(rejected.published, [
    { subject: FORM_SUBMISSION_FAILURE_SUBJECT, msgID: "failed:0" },
  ]);
  assert.equal(rejected.state.submissions.length, 0);

  const poison = await runConsumer([{ data: { version: 1, nope: true } }]);
  assert.deepEqual(poison.outcomes, ["ack:0"]);
  assert.equal(poison.published[0].subject, FORM_SUBMISSION_FAILURE_SUBJECT);
});

test("consumer naks transient failures with backoff and parks after 10 deliveries", async () => {
  const transient = async () => {
    throw new Error("database unavailable");
  };
  const retried = await runConsumer([{ data: message(), deliveryCount: 1 }], {
    create: transient,
  });
  assert.deepEqual(retried.outcomes, ["nak:0:10000"]);
  assert.deepEqual(retried.published, []);

  const parked = await runConsumer([{ data: message(), deliveryCount: 10 }], {
    create: transient,
  });
  assert.deepEqual(parked.outcomes, ["ack:0"]);
  assert.equal(parked.published.length, 1);
});

test("consumer acks a concurrent duplicate (P2002) only when the row exists", async () => {
  const committed = await runConsumer([{ data: message() }], {
    create: async (_input, harness) => {
      harness.state().submissions.push({ submissionId: SUBMISSION_ID });
      throw new KnownRequestError("P2002");
    },
  });
  assert.deepEqual(committed.outcomes, ["ack:0"]);
  assert.deepEqual(committed.published, []);

  const missing = await runConsumer([{ data: message() }], {
    create: async () => {
      throw new KnownRequestError("P2002");
    },
  });
  assert.deepEqual(missing.outcomes, ["nak:0:10000"]);
});

test("proposeFieldChange records a PROPOSED entry for every submission", async () => {
  const created: Row[] = [];
  const queries: Row[] = [];
  const { proposeFieldChange } = loadModule<{
    proposeFieldChange: (tx: unknown, input: Row) => Promise<boolean>;
  }>("src/services/contact-change-logs/index.ts", {
    "@/lib/api-guard": { ApiError: Error },
    "@/lib/prisma": {},
    "@/services/contacts/access": {},
    "@/services/contacts/field-access": {},
    "@/types": {
      ChangeAction: { PROPOSED: "PROPOSED", UPDATED: "UPDATED" },
    },
  });
  const tx = {
    contactChangeLog: {
      findFirst: async (query: Row) => {
        queries.push(query);
        return null;
      },
      create: async ({ data }: { data: Row }) => {
        const row = { id: `log-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      },
    },
  };
  const input = {
    contactId: "contact",
    fieldName: "phone",
    oldValue: "+49 111",
    newValue: "+49 222",
    userName: "Website form",
    metadata: { source: "website-form", submissionId: SUBMISSION_ID },
  };
  assert.equal(await proposeFieldChange(tx, input), true);
  assert.deepEqual(
    {
      action: created[0].action,
      fieldName: created[0].fieldName,
      oldValue: created[0].oldValue,
      newValue: created[0].newValue,
      userName: created[0].userName,
    },
    {
      action: "PROPOSED",
      fieldName: "phone",
      oldValue: '"+49 111"',
      newValue: '"+49 222"',
      userName: "Website form",
    },
  );
  // The same value again is recorded again: whether it shows depends on
  // its own submission; the review groups equal proposals.
  assert.equal(await proposeFieldChange(tx, input), true);
  assert.equal(created.length, 2);
  assert.equal(queries.length, 0, "no lookup for a pending one");
});
