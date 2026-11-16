import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { FundingStatus } from "@/types";
import {
  createFundingRequest,
  createUser,
  db,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

/*
  Every field a list allows sorting by actually sorts, in both directions,
  and a contact's primary e-mail (kept by a trigger for sorting) follows
  every change to the contact's addresses.
*/

type Sort = { field: string; direction: "asc" | "desc" };

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const boundaries = {
  "@/lib/api-guard": { ApiError },
  "@/auth": { auth: async () => null },
  "@/lib/utils": { handlePrismaError: (error: unknown) => error },
  "@/services/file/pending-uploads": {
    assertPendingUploadsAvailable: async () => undefined,
    consumePendingUploads: async () => undefined,
  },
  "@/services/file/s3-service": {
    assertStoredFileExists: async () => undefined,
  },
};

// biome-ignore lint/suspicious/noExplicitAny: each service has its own shape
type Service = Record<string, any>;
const load = (path: string) => loadService<Service>(path, boundaries);
const contacts = load("src/services/contacts/index.ts");
const organizations = load("src/services/organizations/index.ts");
const users = load("src/services/users/index.ts");
const files = load("src/services/file/index.ts");
const events = load("src/services/events/index.ts");
const transactions = load("src/services/transactions/index.ts");
const fundingRequests = load("src/services/funding-request/index.ts");
const agreements = load("src/services/donation-agreement/index.ts");
const teams = load("src/services/teams/index.ts");
const lists = load("src/services/contact-lists/index.ts");

beforeEach(resetDatabase);
after(disconnect);

const page = { page: 1, pageSize: 50 };

const eachSort = async (
  fields: readonly string[],
  read: (sort: Sort) => Promise<{ data: unknown[] }>,
) => {
  for (const field of fields) {
    for (const direction of ["asc", "desc"] as const) {
      const result = await read({ field, direction });
      assert.ok(Array.isArray(result.data), `${field} ${direction}`);
    }
  }
};

test("every allowed sort of every list runs", async () => {
  const setup = await createFundingRequest({
    amountAgreed: 100,
    status: FundingStatus.FundsDisbursing,
  });
  const { team, organization, submitter } = setup;
  await db.transaction.create({
    data: {
      amount: 10,
      totalAmount: 100,
      remainingAmount: 90,
      fundingRequestId: setup.fundingRequest.id,
      organizationId: organization.id,
      teamId: team.id,
    },
  });
  const contact = await db.contact.create({
    data: { teamId: team.id, name: "Person", phone: "+49 1" },
  });
  const event = await db.event.create({
    data: { teamId: team.id, title: "Talk", startDate: new Date() },
  });
  await db.eventRegistration.create({
    data: {
      eventId: event.id,
      contactId: contact.id,
      name: "Person",
      email: "person@example.org",
    },
  });
  await db.file.create({
    data: {
      url: "files/one.pdf",
      type: "REPORT",
      organizationId: organization.id,
      createdById: submitter.id,
      updatedById: submitter.id,
    },
  });
  await db.contactList.create({
    data: { teamId: team.id, name: "List", type: "MANUAL" },
  });

  await eachSort(contacts.CONTACT_SORT_FIELDS, (sort) =>
    contacts.getTeamContacts(team.id, undefined, submitter.id, [], ["Admin"], {
      ...page,
      sort,
    }),
  );
  await eachSort(organizations.ORGANIZATION_SORT_FIELDS, (sort) =>
    organizations.getOrganizations("", team.id, [], { ...page, sort }),
  );
  await eachSort(users.USER_SORT_FIELDS, (sort) =>
    users.getUsers({ teamId: team.id }, "", { ...page, sort }),
  );
  await eachSort(files.FILE_SORT_FIELDS, (sort) =>
    files.getFilesPage({ teamId: team.id }, "", { ...page, sort }),
  );
  await eachSort(events.EVENT_SORT_FIELDS, (sort) =>
    events.getTeamEventsPage(team.id, undefined, {}, { ...page, sort }),
  );
  await eachSort(events.EVENT_REGISTRATION_SORT_FIELDS, (sort) =>
    events.getEventRegistrationsPage(event.id, team.id, "", { ...page, sort }),
  );
  await eachSort(transactions.TRANSACTION_SORT_FIELDS, (sort) =>
    transactions.getTransactions({
      teamId: team.id,
      pagination: { ...page, sort },
    }),
  );
  await eachSort(fundingRequests.FUNDING_REQUEST_SORT_FIELDS, (sort) =>
    fundingRequests.getFundingRequests({ teamId: team.id, orgId: "" }, "", [], {
      ...page,
      sort,
    }),
  );
  await eachSort(agreements.DONATION_AGREEMENT_SORT_FIELDS, (sort) =>
    agreements.getDonationAgreements({ teamId: team.id, orgId: "" }, "", {
      pagination: { ...page, sort },
    }),
  );
  await eachSort(teams.TEAM_SORT_FIELDS, (sort) =>
    teams.getTeamsPage({ query: "", modules: [], ...page, sort }),
  );
  await eachSort(lists.CONTACT_LIST_SORT_FIELDS, (sort) =>
    lists.getTeamContactListsPage(
      team.id,
      submitter.id,
      ["Admin"],
      {},
      {
        ...page,
        sort,
      },
    ),
  );
});

const primaryEmailOf = async (contactId: string) =>
  (
    await db.contact.findUniqueOrThrow({
      where: { id: contactId },
      select: { primaryEmail: true },
    })
  ).primaryEmail;

test("a contact's primary e-mail copy follows every change to its addresses", async () => {
  const team = await db.teams.create({
    data: { name: "Mail", email: "mail@example.org" },
  });
  const contact = await db.contact.create({
    data: {
      teamId: team.id,
      name: "Giulia",
      emails: {
        create: [
          { teamId: team.id, email: "giulia@example.org", kind: "PRIMARY" },
          { teamId: team.id, email: "g@example.org", kind: "ALIAS" },
        ],
      },
    },
  });
  assert.equal(await primaryEmailOf(contact.id), "giulia@example.org");

  // An alias changing leaves the primary as it is.
  await db.contactEmail.updateMany({
    where: { contactId: contact.id, kind: "ALIAS" },
    data: { email: "conti@example.org" },
  });
  assert.equal(await primaryEmailOf(contact.id), "giulia@example.org");

  // The primary changes, as an edit does it (delete, then the new one).
  await db.contactEmail.deleteMany({
    where: { contactId: contact.id, kind: "PRIMARY" },
  });
  assert.equal(await primaryEmailOf(contact.id), null);
  await db.contactEmail.create({
    data: {
      teamId: team.id,
      contactId: contact.id,
      email: "new@example.org",
      kind: "PRIMARY",
    },
  });
  assert.equal(await primaryEmailOf(contact.id), "new@example.org");

  // An alias promoted to primary.
  await db.contactEmail.deleteMany({
    where: { contactId: contact.id, kind: "PRIMARY" },
  });
  await db.contactEmail.updateMany({
    where: { contactId: contact.id, email: "conti@example.org" },
    data: { kind: "PRIMARY" },
  });
  assert.equal(await primaryEmailOf(contact.id), "conti@example.org");
});

test("edits and merges through the service keep the copy right", async () => {
  const editor = await createUser("Editor");
  const team = await db.teams.create({
    data: { name: "Merge", email: "merge@example.org" },
  });
  const contact = (name: string, email: string) =>
    db.contact.create({
      data: {
        teamId: team.id,
        name,
        emails: { create: { teamId: team.id, email, kind: "PRIMARY" } },
      },
    });
  const target = await contact("Target", "target@example.org");
  const source = await contact("Source", "source@example.org");

  await contacts.updateContact(
    { contactId: target.id, teamId: team.id, email: "Edited@Example.org" },
    editor.id,
    "Editor",
    ["Admin"],
  );
  assert.equal(await primaryEmailOf(target.id), "edited@example.org");

  await contacts.mergeContacts(
    {
      teamId: team.id,
      targetContactId: target.id,
      sourceContactIds: [source.id],
      primaryEmail: "source@example.org",
      preservedEmails: [{ email: "edited@example.org", kind: "ALIAS" }],
    },
    editor.id,
    "Editor",
    ["Admin"],
  );
  assert.equal(await primaryEmailOf(target.id), "source@example.org");
});

test("contacts sort by primary e-mail, without one last", async () => {
  const admin = await createUser("Admin");
  const team = await db.teams.create({
    data: { name: "Sort", email: "sort@example.org" },
  });
  for (const [name, email] of [
    ["Zoe", "a@example.org"],
    ["Ada", "c@example.org"],
    ["Bo", null],
    ["Cy", "b@example.org"],
  ] as const) {
    await db.contact.create({
      data: {
        teamId: team.id,
        name,
        ...(email
          ? { emails: { create: { teamId: team.id, email, kind: "PRIMARY" } } }
          : {}),
      },
    });
  }
  const names = async (direction: "asc" | "desc") =>
    (
      await contacts.getTeamContacts(
        team.id,
        undefined,
        admin.id,
        [],
        ["Admin"],
        { ...page, sort: { field: "email", direction } },
      )
    ).data.map((row: { name: string }) => row.name);

  assert.deepEqual(await names("asc"), ["Zoe", "Cy", "Ada", "Bo"]);
  assert.deepEqual(await names("desc"), ["Ada", "Cy", "Zoe", "Bo"]);
});
