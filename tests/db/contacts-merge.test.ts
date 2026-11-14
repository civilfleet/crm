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

type ContactsService = {
  mergeContacts: (
    input: {
      teamId: string;
      targetContactId: string;
      sourceContactIds: string[];
      primaryEmail: string;
      preservedEmails: Array<{ email: string; kind: string; label?: string }>;
      fieldSelections?: Record<string, unknown>;
    },
    userId?: string,
    userName?: string,
  ) => Promise<{ id: string }>;
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const service = loadService<ContactsService>("src/services/contacts/index.ts", {
  "@/lib/api-guard": { ApiError },
});

beforeEach(resetDatabase);
after(disconnect);

/** Every column in the database that references a contact. */
const contactReferences = async () =>
  db.$queryRaw<Array<{ table: string; column: string }>>`
    SELECT kcu.table_name AS "table", kcu.column_name AS "column"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = current_schema()
      AND ccu.table_name = 'Contact'
      AND ccu.column_name = 'id'
    ORDER BY 1, 2
  `;

const countReferences = async (
  references: Array<{ table: string; column: string }>,
  contactIds: string[],
) => {
  const counts: Record<string, number> = {};
  for (const { table, column } of references) {
    const [{ count }] = await db.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM "${table}" WHERE "${column}" = ANY($1::text[])`,
      contactIds,
    );
    counts[`${table}.${column}`] = count;
  }
  return counts;
};

/** A team with two contacts; the source has a record in every table. */
const createMergeSetup = async () => {
  const user = await createUser("Editor");
  const team = await db.teams.create({
    data: { name: "Merge team", email: "merge-team@example.org" },
  });
  const [groupA, groupB] = await Promise.all(
    ["Group A", "Group B"].map((name) =>
      db.group.create({ data: { teamId: team.id, name } }),
    ),
  );
  const contact = (name: string, email: string) =>
    db.contact.create({
      data: {
        teamId: team.id,
        name,
        emails: {
          create: { teamId: team.id, email, kind: "PRIMARY" },
        },
      },
    });
  const target = await contact("Giulia Conti", "giulia@example.org");
  const source = await contact("G. Conti", "g.conti@example.org");

  const organization = await db.organization.create({
    data: {
      name: "Harbour Aid",
      email: "harbour@example.org",
      teamId: team.id,
      contactPersonId: source.id,
    },
  });
  const list = await db.contactList.create({
    data: { teamId: team.id, name: "Newsletter" },
  });
  const event = await db.event.create({
    data: { teamId: team.id, title: "Open day", startDate: new Date() },
  });
  const eventRole = await db.eventRole.create({
    data: { teamId: team.id, name: "Speaker" },
  });
  const inbox = await db.emailInbox.create({
    data: {
      teamId: team.id,
      groupId: groupA.id,
      name: "Office",
      host: "imap.example.org",
      port: 993,
      username: "office",
      passwordEncrypted: "x",
    },
  });
  const message = await db.inboundEmailMessage.create({
    data: {
      teamId: team.id,
      groupId: groupA.id,
      emailInboxId: inbox.id,
      mailbox: "INBOX",
      uidValidity: BigInt(1),
      uid: BigInt(1),
      fromEmail: "g.conti@example.org",
      body: "Hello",
      receivedAt: new Date(),
      contactId: source.id,
    },
  });
  const batch = await db.emailBatch.create({
    data: {
      teamId: team.id,
      provider: "SCALEWAY_TEM",
      subject: "News",
      html: "<p>News</p>",
    },
  });

  await db.contactGroup.createMany({
    data: [
      { contactId: target.id, groupId: groupB.id },
      { contactId: source.id, groupId: groupA.id },
    ],
  });
  await db.contactOrganization.create({
    data: { contactId: source.id, organizationId: organization.id },
  });
  await db.contactListMember.create({
    data: { listId: list.id, contactId: source.id },
  });
  await db.contactAttribute.create({
    data: {
      contactId: source.id,
      key: "shirt size",
      type: "STRING",
      stringValue: "M",
    },
  });
  await db.contactSocialLink.create({
    data: { contactId: source.id, platform: "mastodon", handle: "@g" },
  });
  await db.file.create({
    data: {
      url: "contacts/g-conti/cv.pdf",
      type: "CONTACT_FILE",
      contactId: source.id,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  await db.eventContact.create({
    data: { eventId: event.id, contactId: source.id },
  });
  await db.eventContactRole.create({
    data: {
      eventId: event.id,
      contactId: source.id,
      eventRoleId: eventRole.id,
    },
  });
  await db.eventRegistration.create({
    data: {
      eventId: event.id,
      contactId: source.id,
      name: "G. Conti",
      email: "g.conti@example.org",
    },
  });
  await db.formSubmission.create({
    data: {
      submissionId: randomUUID(),
      teamId: team.id,
      contactId: source.id,
      formId: "volunteer",
      formTitle: "Volunteer",
      formRevision: "1",
      locale: "en",
      answers: { motivation: "Help" },
      submittedAt: new Date(),
      receivedAt: new Date(),
    },
  });
  await db.contactEngagement.create({
    data: {
      contactId: source.id,
      teamId: team.id,
      direction: "OUTBOUND",
      source: "TODO",
      message: "Call back",
      engagedAt: new Date(),
      assignedToUserId: user.id,
    },
  });
  await db.contactChangeLog.create({
    data: { contactId: source.id, action: "CREATED" },
  });
  await db.contactAccessReview.create({
    data: {
      teamId: team.id,
      groupId: groupA.id,
      contactId: source.id,
      source: "INBOUND_EMAIL",
      inboundEmailMessageId: message.id,
    },
  });
  await db.emailRecipient.create({
    data: {
      batchId: batch.id,
      email: "g.conti@example.org",
      contactId: source.id,
    },
  });

  return { user, team, groupA, groupB, target, source, message };
};

const mergeInput = (setup: Awaited<ReturnType<typeof createMergeSetup>>) => ({
  teamId: setup.team.id,
  targetContactId: setup.target.id,
  sourceContactIds: [setup.source.id],
  primaryEmail: "giulia@example.org",
  preservedEmails: [{ email: "g.conti@example.org", kind: "ALIAS" }],
});

test("merging keeps every record that pointed at the merged contact", async () => {
  const setup = await createMergeSetup();
  const references = await contactReferences();
  const before = await countReferences(references, [setup.source.id]);

  // The fixture must cover every table that points at a contact: a new
  // table fails here until it is added above and merge moves it.
  const uncovered = Object.entries(before)
    .filter(([, count]) => count === 0)
    .map(([reference]) => reference);
  assert.deepEqual(uncovered, [], "add these to createMergeSetup");

  const totalBefore = await countReferences(references, [
    setup.source.id,
    setup.target.id,
  ]);

  await service.mergeContacts(mergeInput(setup), setup.user.id, "Editor");

  assert.equal(
    await db.contact.count({ where: { id: setup.source.id } }),
    0,
    "the source contact is gone",
  );
  const after = await countReferences(references, [setup.target.id]);
  const lost = Object.keys(totalBefore).filter((reference) => {
    // Merging adds one entry to the history.
    const expected =
      totalBefore[reference] +
      (reference === "ContactChangeLog.contactId" ? 1 : 0);
    return after[reference] !== expected;
  });
  assert.deepEqual(
    lost.map(
      (reference) =>
        `${reference}: ${totalBefore[reference]} before, ${after[reference]} after`,
    ),
    [],
    "records lost or duplicated by the merge",
  );

  const engagement = await db.contactEngagement.findFirstOrThrow({
    where: { contactId: setup.target.id },
  });
  assert.equal(engagement.assignedToUserId, setup.user.id);
  const emails = await db.contactEmail.findMany({
    where: { contactId: setup.target.id },
    orderBy: { email: "asc" },
  });
  assert.deepEqual(
    emails.map(({ email, kind }) => [email, kind]),
    [
      ["g.conti@example.org", "ALIAS"],
      ["giulia@example.org", "PRIMARY"],
    ],
  );
});

test("merging two contacts reviewed for the same message keeps one review", async () => {
  const setup = await createMergeSetup();
  await db.contactAccessReview.create({
    data: {
      teamId: setup.team.id,
      groupId: setup.groupA.id,
      contactId: setup.target.id,
      source: "INBOUND_EMAIL",
      inboundEmailMessageId: setup.message.id,
    },
  });

  await service.mergeContacts(mergeInput(setup), setup.user.id, "Editor");

  assert.equal(
    await db.contactAccessReview.count({
      where: { inboundEmailMessageId: setup.message.id },
    }),
    1,
  );
});

test("a merge that fails changes nothing", async () => {
  const setup = await createMergeSetup();
  const references = await contactReferences();
  const before = await countReferences(references, [
    setup.source.id,
    setup.target.id,
  ]);

  // An e-mail owned by a third contact cannot become the primary address.
  await db.contact.create({
    data: {
      teamId: setup.team.id,
      name: "Someone else",
      emails: {
        create: {
          teamId: setup.team.id,
          email: "taken@example.org",
          kind: "PRIMARY",
        },
      },
    },
  });
  await assert.rejects(
    service.mergeContacts(
      { ...mergeInput(setup), primaryEmail: "taken@example.org" },
      setup.user.id,
    ),
    /already belongs to another contact/,
  );

  assert.deepEqual(
    await countReferences(references, [setup.source.id, setup.target.id]),
    before,
  );
  assert.equal(await db.contact.count({ where: { id: setup.source.id } }), 1);
});
