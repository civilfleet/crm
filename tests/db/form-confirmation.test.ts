import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import {
  createUser,
  db,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

/*
  Double opt-in on real data: who gets an e-mail (and how often), what a
  confirmation grants, what the public counter counts, and what is removed
  when nobody confirms within 7 days.
*/

type Mail = { to: string; subject: string; html: string; text: string };
type ConfirmationsService = {
  sendDueConfirmations: (input: {
    readForm: (formId: string, locale: string) => Promise<unknown>;
    websiteUrl: string;
    key: string;
    send?: (mail: Mail) => Promise<void>;
    limits?: Record<string, number>;
    now?: Date;
    log?: Pick<Console, "info" | "warn" | "error">;
  }) => Promise<{ sent: number; skipped: number; waiting: number }>;
  confirmFormSubmission: (message: {
    version: 1;
    submissionId: string;
    confirmedAt: string;
  }) => Promise<string>;
  removeExpiredUnconfirmed: (
    now?: Date,
  ) => Promise<{ submissionsRemoved: number; contactsRemoved: number }>;
};
type FormSubmissionsService = {
  createFormSubmission: (input: unknown) => Promise<{
    contactId: string;
    submissionId: string;
  }>;
};
type FormsService = {
  updateFormSetting: (
    teamId: string,
    formId: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  getFormCountRows: () => Promise<Array<{ formId: string; count: number }>>;
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
// The default sender's two ways out, captured.
const smtpMails: Array<Record<string, unknown>> = [];
const scalewayMails: Array<Record<string, unknown>> = [];
const boundaries = {
  "@/lib/api-guard": { ApiError },
  "@/lib/nodemailer": {
    getTransporter: () => ({
      sendMail: async (mail: Record<string, unknown>) => {
        smtpMails.push(mail);
      },
    }),
  },
  "@/services/integrations/scaleway-email": {
    sendScalewayTransactionalEmail: async (mail: Record<string, unknown>) => {
      scalewayMails.push(mail);
    },
  },
};
const confirmations = loadService<ConfirmationsService>(
  "src/services/form-confirmations/index.ts",
  boundaries,
);
const intake = loadService<FormSubmissionsService>(
  "src/services/form-submissions/index.ts",
  boundaries,
);
const forms = loadService<FormsService>("src/services/forms/index.ts");

beforeEach(resetDatabase);
after(disconnect);

const KEY = "db-test-key";
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

const createTeam = () =>
  db.teams.create({
    data: {
      name: "Petition",
      email: "petition@example.org",
      publicFormsEnabled: true,
    },
  });

const sign = (
  teamId: string,
  email: string,
  options: {
    confirmation?: boolean;
    marketing?: boolean;
    at?: string;
    source?: string;
  } = {},
) =>
  intake.createFormSubmission({
    version: 1,
    submissionId: randomUUID(),
    receivedAt: options.at ?? "2026-11-17T10:00:00.000Z",
    ...(options.source ? { source: options.source } : {}),
    submission: {
      version: 1,
      teamId,
      form: {
        id: "petition",
        title: "Firma la lettera",
        revision: "1",
        locale: "it",
        ...(options.confirmation === false ? {} : { confirmation: "email" }),
      },
      submittedAt: options.at ?? "2026-11-17T10:00:00.000Z",
      contact: { email, name: "Giulia" },
      answers: options.marketing
        ? [
            {
              id: "updates",
              label: "Voglio ricevere aggiornamenti",
              type: "consent",
              value: true,
              purpose: "marketing",
            },
          ]
        : [],
    },
  });

const run = (
  sent: Mail[],
  overrides: Partial<
    Parameters<ConfirmationsService["sendDueConfirmations"]>[0]
  > = {},
) =>
  confirmations.sendDueConfirmations({
    readForm: async () => null,
    websiteUrl: "https://sea-watch.org",
    key: KEY,
    send: async (mail) => {
      sent.push(mail);
    },
    now: new Date("2026-11-17T10:05:00.000Z"),
    log: quiet,
    ...overrides,
  });

test("every submission gets its own e-mail, at most three a day per address", async () => {
  const team = await createTeam();
  // Signing again needs its own confirmation: nothing else proves it.
  await sign(team.id, "giulia@example.org");
  await sign(team.id, "Giulia@Example.org");
  await sign(team.id, "marco@example.org", { confirmation: false });

  const sent: Mail[] = [];
  const result = await run(sent);
  assert.deepEqual(result, { sent: 2, skipped: 0, waiting: 0 });
  assert.ok(sent.every((mail) => mail.to === "giulia@example.org"));
  assert.notEqual(sent[0].text, sent[1].text, "each with its own link");
  assert.match(
    sent[0].text,
    /https:\/\/sea-watch\.org\/it\/form-confirmation#/,
  );
  assert.equal(sent[0].subject, "Conferma il tuo indirizzo e-mail");
  // Nothing is sent twice.
  assert.deepEqual(await run(sent), { sent: 0, skipped: 0, waiting: 0 });

  // A flood with one address: three a day, the rest is not mailed.
  for (let index = 0; index < 3; index++)
    await sign(team.id, "giulia@example.org");
  const flood = await run(sent);
  assert.deepEqual(flood, { sent: 1, skipped: 2, waiting: 0 });
});

test("the hourly limit holds the rest back; an unreadable form waits", async () => {
  const team = await createTeam();
  for (const name of ["a", "b", "c"])
    await sign(team.id, `${name}@example.org`);

  const sent: Mail[] = [];
  const limits = {
    batch: 25,
    perHour: 2,
    perAddressPerDay: 3,
    perSourcePerHour: 30,
    concurrency: 5,
  };
  assert.equal((await run(sent, { limits })).sent, 2);
  assert.equal((await run(sent, { limits })).sent, 0, "the hour is used up");

  const failing = await run(sent, {
    now: new Date("2026-11-17T12:00:00.000Z"),
    readForm: async () => {
      throw new Error("site down");
    },
  });
  assert.deepEqual(failing, { sent: 0, skipped: 0, waiting: 1 });
  const later = await run(sent, { now: new Date("2026-11-17T12:01:00.000Z") });
  assert.equal(later.sent, 1);
});

test("one sender cannot use up the budget: its e-mails wait, others go", async () => {
  const team = await createTeam();
  const busy = "a".repeat(64);
  for (let index = 0; index < 4; index++)
    await sign(team.id, `bot${index}@example.org`, { source: busy });
  await sign(team.id, "person@example.org", { source: "b".repeat(64) });

  const sent: Mail[] = [];
  const limits = {
    batch: 25,
    perHour: 100,
    perAddressPerDay: 3,
    perSourcePerHour: 2,
    concurrency: 5,
  };
  const result = await run(sent, { limits });
  assert.deepEqual(result, { sent: 3, skipped: 0, waiting: 2 });
  assert.ok(sent.some((mail) => mail.to === "person@example.org"));
  // An hour later the waiting ones go.
  const later = await run(sent, {
    limits,
    now: new Date("2026-11-17T11:10:00.000Z"),
  });
  assert.equal(later.sent, 2);
});

test("a team with verified Scaleway sends through it; others through SMTP", async () => {
  const scaleway = await createTeam();
  const plain = await db.teams.create({
    data: {
      name: "Plain",
      email: "plain@example.org",
      publicFormsEnabled: true,
    },
  });
  await db.integrationConnection.create({
    data: {
      teamId: scaleway.id,
      provider: "SCALEWAY_TEM",
      isEnabled: true,
      apiKey: "enc:v1:test:x:y:z",
      defaultListId: "project",
      senderEmail: "firma@sea-watch.org",
      senderName: "Sea-Watch",
      lastSyncedAt: new Date(),
    },
  });
  await sign(scaleway.id, "a@example.org");
  await sign(plain.id, "b@example.org");
  smtpMails.length = 0;
  scalewayMails.length = 0;

  const result = await confirmations.sendDueConfirmations({
    readForm: async () => null,
    websiteUrl: "https://sea-watch.org",
    key: KEY,
    now: new Date("2026-11-17T10:05:00.000Z"),
    log: quiet,
  });
  assert.equal(result.sent, 2);
  assert.equal(scalewayMails.length, 1);
  assert.deepEqual(scalewayMails[0].from, {
    email: "firma@sea-watch.org",
    name: "Sea-Watch",
  });
  assert.deepEqual(scalewayMails[0].to, { email: "a@example.org" });
  assert.equal(smtpMails.length, 1);
  assert.equal(smtpMails[0].to, "b@example.org");
});

test("confirming grants the marketing consent and counts the person", async () => {
  const team = await createTeam();
  const confirmed = await sign(team.id, "giulia@example.org", {
    marketing: true,
  });
  await sign(team.id, "marco@example.org", { marketing: true });
  await forms.updateFormSetting(team.id, "petition", {
    publicCount: true,
    countConfirmedOnly: true,
  });
  assert.equal((await forms.getFormCountRows())[0].count, 0);

  const message = {
    version: 1 as const,
    submissionId: confirmed.submissionId,
    confirmedAt: "2026-11-17T11:00:00.000Z",
  };
  assert.equal(await confirmations.confirmFormSubmission(message), "confirmed");
  assert.equal(await confirmations.confirmFormSubmission(message), "already");
  assert.equal(
    await confirmations.confirmFormSubmission({
      ...message,
      submissionId: randomUUID(),
    }),
    "unknown",
  );

  const consents = await db.contactConsent.findMany({
    where: { contactId: confirmed.contactId },
    orderBy: { recordedAt: "asc" },
  });
  assert.deepEqual(
    consents.map(({ status }) => status),
    ["PENDING", "GRANTED"],
  );
  assert.equal(consents[1].wording, "Voglio ricevere aggiornamenti");
  assert.equal(
    consents[1].recordedAt.toISOString(),
    "2026-11-17T11:00:00.000Z",
  );
  assert.equal((await forms.getFormCountRows())[0].count, 1);
});

test("after 7 days, unconfirmed submissions go, and contacts only they made", async () => {
  const team = await createTeam();
  const editor = await createUser("Editor");
  // Made by the submission, nothing else: removed.
  const stranger = await sign(team.id, "stranger@example.org", {
    marketing: true,
  });
  // An existing contact who signs without confirming: the contact stays.
  const known = await db.contact.create({
    data: {
      teamId: team.id,
      name: "Known",
      emails: {
        create: {
          teamId: team.id,
          email: "known@example.org",
          kind: "PRIMARY",
        },
      },
    },
  });
  await sign(team.id, "known@example.org");
  // Made by the submission, then edited by a person: the contact stays.
  const edited = await sign(team.id, "edited@example.org");
  await db.contactChangeLog.create({
    data: {
      contactId: edited.contactId,
      action: "UPDATED",
      fieldName: "notes",
      userId: editor.id,
      userName: "Editor",
    },
  });
  // Confirmed: stays.
  const kept = await sign(team.id, "kept@example.org");
  await confirmations.confirmFormSubmission({
    version: 1,
    submissionId: kept.submissionId,
    confirmedAt: "2026-11-17T12:00:00.000Z",
  });

  const early = await confirmations.removeExpiredUnconfirmed(
    new Date("2026-11-23T10:00:00.000Z"),
  );
  assert.equal(early.submissionsRemoved, 0, "not before 7 days");

  const result = await confirmations.removeExpiredUnconfirmed(
    new Date("2026-11-24T10:00:01.000Z"),
  );
  assert.deepEqual(result, { submissionsRemoved: 3, contactsRemoved: 1 });
  assert.equal(
    await db.contact.count({ where: { id: stranger.contactId } }),
    0,
  );
  assert.equal(await db.contact.count({ where: { id: known.id } }), 1);
  assert.equal(await db.contact.count({ where: { id: edited.contactId } }), 1);
  assert.equal(await db.formSubmission.count(), 1);
  assert.equal(await db.contactConsent.count(), 0);
  assert.equal(
    await db.contactEngagement.count({ where: { contactId: known.id } }),
    0,
    "the engagement of the unconfirmed submission is gone",
  );
});
