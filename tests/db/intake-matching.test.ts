import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { describeCreation } from "@/lib/contact-change-format";
import type { ContactChangeLog } from "@/types";
import { db, disconnect, loadService, resetDatabase } from "./helpers";

/*
  How a website submission finds its contact: by e-mail only. A phone number
  never picks a contact; it notes a possible duplicate for a person to judge.
  An address in the trash brings its contact back.
*/

type IntakeService = {
  createFormSubmission: (input: unknown) => Promise<{ contactId: string }>;
};
type DuplicatesService = {
  getDuplicateHints: (
    teamId: string,
    contactId: string,
    viewer: { roles?: string[]; userName?: string },
  ) => Promise<Array<{ contact: { id: string; name: string } }>>;
  dismissDuplicateHint: (
    teamId: string,
    contactId: string,
    duplicateOfId: string,
    viewer: { roles?: string[]; userName?: string },
  ) => Promise<unknown>;
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const boundaries = { "@/lib/api-guard": { ApiError } };
type ChangeLogsService = {
  getContactCreationLog: (
    contactId: string,
  ) => Promise<ContactChangeLog | null>;
};
const intake = loadService<IntakeService>(
  "src/services/form-submissions/index.ts",
  boundaries,
);
const duplicates = loadService<DuplicatesService>(
  "src/services/contact-duplicates/index.ts",
  boundaries,
);

const changeLogs = loadService<ChangeLogsService>(
  "src/services/contact-change-logs/index.ts",
  boundaries,
);

beforeEach(resetDatabase);
after(disconnect);

const admin = { roles: ["Admin"], userName: "Reviewer" };

const setup = async () => {
  const team = await db.teams.create({
    data: {
      name: "Match",
      email: "match@example.org",
      publicFormsEnabled: true,
    },
  });
  const giulia = await db.contact.create({
    data: {
      teamId: team.id,
      name: "Giulia Rossi",
      phone: "+49 151 23456789",
      emails: {
        create: {
          teamId: team.id,
          email: "giulia@example.org",
          kind: "PRIMARY",
        },
      },
    },
  });
  return { team, giulia };
};

const submit = (teamId: string, contact: Record<string, string>) =>
  intake.createFormSubmission({
    version: 1,
    submissionId: randomUUID(),
    receivedAt: "2026-11-18T10:00:00.000Z",
    submission: {
      version: 1,
      teamId,
      form: { id: "petition", title: "Firma", revision: "1", locale: "it" },
      submittedAt: "2026-11-18T10:00:00.000Z",
      contact,
      answers: [],
    },
  });

test("the same phone with another address makes a new contact, noted as a possible duplicate", async () => {
  const { team, giulia } = await setup();
  // Same number in its national form, another address.
  const { contactId } = await submit(team.id, {
    email: "g.rossi+test@example.org",
    name: "G. Rossi",
    phone: "0151 2345 6789",
  });
  assert.notEqual(contactId, giulia.id, "a phone number picks no contact");
  const original = await db.contactEmail.findMany({
    where: { contactId: giulia.id },
  });
  assert.deepEqual(
    original.map(({ email }) => email),
    ["giulia@example.org"],
    "nothing attached to the existing contact",
  );
  assert.equal(
    await db.contactChangeLog.count({
      where: { contactId: giulia.id, action: "PROPOSED" },
    }),
    0,
    "and nothing proposed for it",
  );

  const hints = await duplicates.getDuplicateHints(team.id, contactId, admin);
  assert.deepEqual(
    hints.map(({ contact }) => contact.id),
    [giulia.id],
  );

  // A person decides they are different people: the note goes away.
  await duplicates.dismissDuplicateHint(team.id, contactId, giulia.id, admin);
  assert.deepEqual(
    await duplicates.getDuplicateHints(team.id, contactId, admin),
    [],
  );
});

test("the same address finds the contact, whatever the phone", async () => {
  const { team, giulia } = await setup();
  const { contactId } = await submit(team.id, {
    email: "Giulia@Example.org",
    phone: "+39 333 1234567",
  });
  assert.equal(contactId, giulia.id);
  // A different phone is proposed, not applied.
  const proposal = await db.contactChangeLog.findFirstOrThrow({
    where: { contactId: giulia.id, action: "PROPOSED", fieldName: "phone" },
  });
  assert.equal(JSON.parse(proposal.newValue ?? "null"), "+39 333 1234567");
});

test("an address in the trash brings its contact back", async () => {
  const { team, giulia } = await setup();
  await db.contact.update({
    where: { id: giulia.id },
    data: { deletedAt: new Date("2026-10-01T00:00:00Z") },
  });
  const { contactId } = await submit(team.id, { email: "giulia@example.org" });
  assert.equal(contactId, giulia.id);
  const restored = await db.contact.findUniqueOrThrow({
    where: { id: giulia.id },
  });
  assert.equal(restored.deletedAt, null);
  assert.equal(await db.contact.count(), 1, "no second contact");
});

test("a contact made by a form says which form made it", async () => {
  const { team } = await setup();
  const { contactId } = await submit(team.id, {
    email: "new.person@example.org",
    name: "New Person",
  });
  const log = await changeLogs.getContactCreationLog(contactId);
  assert.ok(log, "the creation is recorded");
  assert.equal(log.metadata?.source, "website-form");
  assert.deepEqual(describeCreation(log), {
    source: "the website form “Firma”",
  });
});
