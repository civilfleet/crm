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
  The "Sent a form" and "Gave consent" contact filters, which smart lists
  use too (docs/DATA_RULES.md, "Consent"): only confirmed submissions by
  default, and consent as it holds now.
*/

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: the service's own shape
type Service = Record<string, any>;
const contacts = loadService<Service>("src/services/contacts/index.ts", {
  "@/lib/api-guard": { ApiError },
  "@/auth": { auth: async () => null },
  "@/lib/utils": { handlePrismaError: (error: unknown) => error },
});

beforeEach(resetDatabase);
after(disconnect);

const at = (time: string) => new Date(`2026-11-20T${time}:00.000Z`);

const setup = async () => {
  const editor = await createUser("Editor");
  const team = await db.teams.create({
    data: { name: "Petition", email: "petition@example.org" },
  });
  const other = await db.teams.create({
    data: { name: "Other", email: "other@example.org" },
  });
  const person = (name: string, teamId = team.id) =>
    db.contact.create({ data: { teamId, name } });
  const sent = (
    contact: { id: string; teamId: string },
    formId: string,
    confirmed: boolean,
  ) =>
    db.formSubmission.create({
      data: {
        submissionId: randomUUID(),
        teamId: contact.teamId,
        contactId: contact.id,
        formId,
        formTitle: formId,
        formRevision: "1",
        locale: "it",
        answers: [],
        submittedAt: at("10:00"),
        receivedAt: at("10:00"),
        confirmationRequested: true,
        confirmedAt: confirmed ? at("10:05") : null,
      },
    });
  const consent = (
    contact: { id: string; teamId: string },
    status: "PENDING" | "GRANTED" | "WITHDRAWN",
    time: string,
    formId?: string,
  ) =>
    db.contactConsent.create({
      data: {
        teamId: contact.teamId,
        contactId: contact.id,
        purpose: "marketing",
        status,
        source: formId ? "FORM" : "MANUAL",
        formId: formId ?? null,
        recordedAt: at(time),
      },
    });
  const names = async (filters: unknown[]) =>
    (
      await contacts.getTeamContacts(team.id, undefined, editor.id, filters, [
        "Admin",
      ])
    )
      .map(({ name }: { name: string }) => name)
      .sort();
  return { team, other, person, sent, consent, names };
};

test("sent a form: confirmed only by default, everyone on request; several must all hold", async () => {
  const { other, person, sent, names } = await setup();
  const anna = await person("Anna");
  const bruno = await person("Bruno");
  const carla = await person("Carla");
  await sent(anna, "petition", true);
  await sent(bruno, "petition", false);
  await sent(carla, "survey", true);
  // Another team's form of the same id is not this team's.
  await sent(await person("Dario", other.id), "petition", true);

  assert.deepEqual(await names([{ type: "form", formId: "petition" }]), [
    "Anna",
  ]);
  assert.deepEqual(
    await names([{ type: "form", formId: "petition", status: "confirmed" }]),
    ["Anna"],
  );
  assert.deepEqual(
    await names([{ type: "form", formId: "petition", status: "any" }]),
    ["Anna", "Bruno"],
  );

  // Two forms: both must hold.
  await sent(anna, "survey", true);
  assert.deepEqual(
    await names([
      { type: "form", formId: "petition" },
      { type: "form", formId: "survey" },
    ]),
    ["Anna"],
  );
});

test("gave consent: as it holds now, optionally given through one form", async () => {
  const { other, person, consent, names } = await setup();
  // Confirmed through the petition.
  const anna = await person("Anna");
  await consent(anna, "PENDING", "10:00", "petition");
  await consent(anna, "GRANTED", "10:05", "petition");
  // Ticked, never confirmed.
  await consent(await person("Bruno"), "PENDING", "10:00", "petition");
  // Given by hand, then withdrawn (an unsubscribe).
  const carla = await person("Carla");
  await consent(carla, "GRANTED", "09:00");
  await consent(carla, "WITHDRAWN", "11:00");
  // Confirmed, then signed again with the tick: the pending tick hides nothing.
  const elena = await person("Elena");
  await consent(elena, "GRANTED", "09:00", "petition");
  await consent(elena, "PENDING", "12:00", "petition");
  // Withdrew, then gave it again through another form.
  const fabio = await person("Fabio");
  await consent(fabio, "WITHDRAWN", "09:00");
  await consent(fabio, "GRANTED", "12:00", "survey");
  // Another team's consent is not this team's.
  await consent(await person("Gina", other.id), "GRANTED", "10:00", "petition");

  assert.deepEqual(await names([{ type: "consent", purpose: "marketing" }]), [
    "Anna",
    "Elena",
    "Fabio",
  ]);
  assert.deepEqual(
    await names([
      { type: "consent", purpose: "marketing", formId: "petition" },
    ]),
    ["Anna", "Elena"],
  );
  // Through a form, but withdrawn since: no longer.
  await consent(anna, "WITHDRAWN", "13:00");
  assert.deepEqual(
    await names([
      { type: "consent", purpose: "marketing", formId: "petition" },
    ]),
    ["Elena"],
  );
});

test("a smart list of confirmed signers who want updates", async () => {
  const { person, sent, consent, names } = await setup();
  const anna = await person("Anna");
  await sent(anna, "petition", true);
  await consent(anna, "GRANTED", "10:05", "petition");
  // Signed and confirmed, without the tick.
  await sent(await person("Bruno"), "petition", true);
  // Wants updates, but has not signed.
  await consent(await person("Carla"), "GRANTED", "09:00");

  assert.deepEqual(
    await names([
      { type: "form", formId: "petition" },
      { type: "consent", purpose: "marketing" },
    ]),
    ["Anna"],
  );
});
