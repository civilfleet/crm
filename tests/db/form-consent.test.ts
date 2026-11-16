import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { db, disconnect, loadService, resetDatabase } from "./helpers";

/*
  A website form's ticked consent with a purpose becomes a consent record
  in the same transaction as the submission; anything else stays an answer.
*/

type FormSubmissionsService = {
  createFormSubmission: (input: unknown) => Promise<{ contactId: string }>;
};
type ConsentsService = {
  getContactConsents: (
    contactId: string,
    teamId: string,
  ) => Promise<
    Array<{
      purpose: string;
      current: { status: string; wording: string | null };
      history: unknown[];
    }>
  >;
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const forms = loadService<FormSubmissionsService>(
  "src/services/form-submissions/index.ts",
  { "@/lib/api-guard": { ApiError } },
);
const consents = loadService<ConsentsService>(
  "src/services/contact-consents/index.ts",
);

beforeEach(resetDatabase);
after(disconnect);

const petition = (
  teamId: string,
  answers: unknown[],
  submittedAt = "2026-11-17T10:00:00.000Z",
) => ({
  version: 1,
  submissionId: randomUUID(),
  receivedAt: submittedAt,
  submission: {
    version: 1,
    teamId,
    form: {
      id: "petition-cambio-di-rotta",
      title: "Firma la lettera",
      revision: "1",
      locale: "it",
    },
    submittedAt,
    contact: { email: "giulia@example.org", name: "Giulia Rossi" },
    answers,
  },
});

const privacy = {
  id: "privacy",
  label: "Acconsento al trattamento dei dati",
  type: "consent",
  value: true,
};
const updates = (value: boolean) => ({
  id: "updates",
  label: "Voglio ricevere aggiornamenti da Sea-Watch",
  type: "consent",
  value,
  purpose: "marketing",
});

test("a ticked marketing consent is recorded with its words", async () => {
  const team = await db.teams.create({
    data: {
      name: "Petition",
      email: "petition@example.org",
      publicFormsEnabled: true,
    },
  });

  const { contactId } = await forms.createFormSubmission(
    petition(team.id, [privacy, updates(true)]),
  );

  const [marketing, ...others] = await consents.getContactConsents(
    contactId,
    team.id,
  );
  assert.equal(others.length, 0, "the privacy consent stays an answer");
  assert.equal(marketing.purpose, "marketing");
  assert.equal(marketing.current.status, "GRANTED");
  assert.equal(
    marketing.current.wording,
    "Voglio ricevere aggiornamenti da Sea-Watch",
  );
});

test("signing again without the tick keeps the earlier consent", async () => {
  const team = await db.teams.create({
    data: {
      name: "Petition",
      email: "petition@example.org",
      publicFormsEnabled: true,
    },
  });

  const { contactId } = await forms.createFormSubmission(
    petition(team.id, [privacy, updates(true)]),
  );
  await forms.createFormSubmission(
    petition(team.id, [privacy, updates(false)], "2026-11-18T10:00:00.000Z"),
  );

  const [marketing] = await consents.getContactConsents(contactId, team.id);
  assert.equal(marketing.current.status, "GRANTED");
  assert.equal(marketing.history.length, 1);
  assert.equal(await db.formSubmission.count({ where: { contactId } }), 2);
});

test("another team's consents are not shown", async () => {
  const team = await db.teams.create({
    data: { name: "Mine", email: "mine@example.org", publicFormsEnabled: true },
  });
  const other = await db.teams.create({
    data: { name: "Other", email: "other@example.org" },
  });
  const { contactId } = await forms.createFormSubmission(
    petition(team.id, [updates(true)]),
  );

  assert.equal(
    (await consents.getContactConsents(contactId, other.id)).length,
    0,
  );
});
