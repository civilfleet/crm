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
  Reviewing changes proposed by website forms: what is listed, and what
  applying (field, primary or additional e-mail) and declining do, once.
*/

type Viewer = { userId?: string; userName?: string; roles?: string[] };
type Pending = {
  id: string;
  field: string;
  currentValue: string | null;
  proposedValue: string | null;
  isCurrent: boolean;
};
type ProposalsService = {
  getPendingProposals: (
    teamId: string,
    viewer: Viewer,
    options?: { contactId?: string },
  ) => Promise<{ data: Pending[]; total: number }>;
  resolveProposal: (
    input: { teamId: string; proposalId: string; decision: string },
    viewer: Viewer,
  ) => Promise<unknown>;
};
type IntakeService = {
  createFormSubmission: (input: unknown) => Promise<{ contactId: string }>;
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
const proposals = loadService<ProposalsService>(
  "src/services/contact-proposals/index.ts",
  boundaries,
);
const intake = loadService<IntakeService>(
  "src/services/form-submissions/index.ts",
  boundaries,
);

beforeEach(resetDatabase);
after(disconnect);

const admin = { roles: ["Admin"], userName: "Reviewer" };

const setup = async () => {
  const team = await db.teams.create({
    data: {
      name: "Review",
      email: "review@example.org",
      publicFormsEnabled: true,
    },
  });
  const contact = await db.contact.create({
    data: {
      teamId: team.id,
      name: "Giulia Rossi",
      city: "Berlin",
      phone: "+49 30 1",
      emails: {
        create: {
          teamId: team.id,
          email: "giulia@example.org",
          kind: "PRIMARY",
        },
      },
    },
  });
  return { team, contact };
};

const submit = (
  teamId: string,
  contact: Record<string, string>,
  form: Record<string, string> = {},
) =>
  intake.createFormSubmission({
    version: 1,
    submissionId: randomUUID(),
    receivedAt: "2026-11-17T10:00:00.000Z",
    submission: {
      version: 1,
      teamId,
      form: {
        id: "petition",
        title: "Firma",
        revision: "1",
        locale: "it",
        ...form,
      },
      submittedAt: "2026-11-17T10:00:00.000Z",
      contact,
      answers: [],
    },
  });

const pendingOf = async (teamId: string, viewer: Viewer = admin) =>
  (await proposals.getPendingProposals(teamId, viewer)).data;

test("applying a field changes it once and records who decided", async () => {
  const { team, contact } = await setup();
  await submit(team.id, { email: "giulia@example.org", city: "Hamburg" });

  const [city] = await pendingOf(team.id);
  assert.deepEqual(
    {
      field: city.field,
      currentValue: city.currentValue,
      proposedValue: city.proposedValue,
    },
    { field: "city", currentValue: "Berlin", proposedValue: "Hamburg" },
  );

  await proposals.resolveProposal(
    { teamId: team.id, proposalId: city.id, decision: "apply" },
    admin,
  );
  const updated = await db.contact.findUniqueOrThrow({
    where: { id: contact.id },
  });
  assert.equal(updated.city, "Hamburg");
  const resolution = await db.contactChangeLog.findFirstOrThrow({
    where: { proposalId: city.id },
  });
  assert.equal(resolution.action, "UPDATED");
  assert.equal(resolution.userName, "Reviewer");
  assert.equal(JSON.parse(resolution.oldValue ?? "null"), "Berlin");
  assert.deepEqual(await pendingOf(team.id), []);

  await assert.rejects(
    proposals.resolveProposal(
      { teamId: team.id, proposalId: city.id, decision: "decline" },
      admin,
    ),
    /already decided/,
  );
});

test("an e-mail becomes primary (old one kept) or is added", async () => {
  const { team, contact } = await setup();
  // Matched by phone with another address: the address is proposed.
  await submit(team.id, { email: "g.rossi@example.org", phone: "+49 30 1" });
  const [email] = await pendingOf(team.id);
  assert.equal(email.field, "email");
  assert.equal(email.proposedValue, "g.rossi@example.org");

  await proposals.resolveProposal(
    { teamId: team.id, proposalId: email.id, decision: "apply" },
    admin,
  );
  const emails = await db.contactEmail.findMany({
    where: { contactId: contact.id },
    orderBy: { email: "asc" },
  });
  assert.deepEqual(
    emails.map(({ email, kind }) => [email, kind]),
    [
      ["g.rossi@example.org", "PRIMARY"],
      ["giulia@example.org", "ALIAS"],
    ],
  );
  const { primaryEmail } = await db.contact.findUniqueOrThrow({
    where: { id: contact.id },
  });
  assert.equal(primaryEmail, "g.rossi@example.org");

  // A further address, added next to the primary one.
  await submit(team.id, { email: "rossi@work.example", phone: "+49 30 1" });
  const [another] = await pendingOf(team.id);
  await proposals.resolveProposal(
    { teamId: team.id, proposalId: another.id, decision: "apply-alias" },
    admin,
  );
  const kinds = await db.contactEmail.findMany({
    where: { contactId: contact.id, email: "rossi@work.example" },
  });
  assert.equal(kinds[0].kind, "ALIAS");
});

test("an address of another contact is refused; declining changes nothing", async () => {
  const { team, contact } = await setup();
  await db.contact.create({
    data: {
      teamId: team.id,
      name: "Someone else",
      emails: {
        create: {
          teamId: team.id,
          email: "taken@example.org",
          kind: "PRIMARY",
        },
      },
    },
  });
  await db.contactChangeLog.create({
    data: {
      contactId: contact.id,
      action: "PROPOSED",
      fieldName: "email",
      oldValue: JSON.stringify("giulia@example.org"),
      newValue: JSON.stringify("taken@example.org"),
      userName: "Website form",
    },
  });
  const [taken] = await pendingOf(team.id);
  await assert.rejects(
    proposals.resolveProposal(
      { teamId: team.id, proposalId: taken.id, decision: "apply" },
      admin,
    ),
    /already belongs to another contact/,
  );

  await proposals.resolveProposal(
    { teamId: team.id, proposalId: taken.id, decision: "decline" },
    admin,
  );
  const resolution = await db.contactChangeLog.findFirstOrThrow({
    where: { proposalId: taken.id },
  });
  assert.equal(resolution.action, "PROPOSAL_REJECTED");
  assert.equal(
    await db.contactEmail.count({ where: { contactId: contact.id } }),
    1,
  );
});

test("proposals from unconfirmed submissions and hidden contacts stay out", async () => {
  const { team, contact } = await setup();
  await submit(
    team.id,
    { email: "giulia@example.org", city: "Napoli" },
    { confirmation: "email" },
  );
  assert.deepEqual(await pendingOf(team.id), [], "waits for the confirmation");
  await db.formSubmission.updateMany({ data: { confirmedAt: new Date() } });
  assert.equal((await pendingOf(team.id)).length, 1, "shown once confirmed");

  // A member outside the contact's group sees nothing and cannot decide.
  const group = await db.group.create({
    data: { teamId: team.id, name: "Restricted" },
  });
  await db.contactGroup.create({
    data: { contactId: contact.id, groupId: group.id },
  });
  const member = await createUser("Member");
  const viewer = { userId: member.id, roles: [] };
  assert.deepEqual(await pendingOf(team.id, viewer), []);
  const [napoli] = await pendingOf(team.id);
  await assert.rejects(
    proposals.resolveProposal(
      { teamId: team.id, proposalId: napoli.id, decision: "apply" },
      viewer,
    ),
    /not found/,
  );
});
