import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  createUser,
  db,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type UpdateInput = {
  contactId: string;
  teamId: string;
  [field: string]: unknown;
};

type ContactsService = {
  updateContact: (
    input: UpdateInput,
    userId?: string,
    userName?: string,
  ) => Promise<unknown>;
};

const service = loadService<ContactsService>("src/services/contacts/index.ts", {
  "@/lib/api-guard": { ApiError },
});

beforeEach(resetDatabase);
after(disconnect);

/** A team with an editor, two groups, two organizations and one contact. */
const createEditSetup = async () => {
  const editor = await createUser("Editor");
  const team = await db.teams.create({
    data: { name: "Edit team", email: "edit-team@example.org" },
  });
  const otherTeam = await db.teams.create({
    data: { name: "Other team", email: "other-team@example.org" },
  });
  const [groupA, groupB] = await Promise.all(
    ["Group A", "Group B"].map((name) =>
      db.group.create({ data: { teamId: team.id, name } }),
    ),
  );
  const foreignGroup = await db.group.create({
    data: { teamId: otherTeam.id, name: "Foreign group" },
  });
  const [orgA, orgB] = await Promise.all(
    ["a", "b"].map((key) =>
      db.organization.create({
        data: {
          name: `Organization ${key}`,
          email: `org-${key}@example.org`,
          teamId: team.id,
        },
      }),
    ),
  );
  const foreignOrg = await db.organization.create({
    data: {
      name: "Foreign organization",
      email: "org-foreign@example.org",
      teamId: otherTeam.id,
    },
  });
  const contact = await db.contact.create({
    data: {
      teamId: team.id,
      name: "Giulia Conti",
      phone: "+49 30 1234",
      city: "Berlin",
      otherMargins: "none given",
      groupId: groupA.id,
      emails: {
        create: {
          teamId: team.id,
          email: "giulia@example.org",
          kind: "PRIMARY",
        },
      },
      groups: { create: { groupId: groupA.id } },
      organizations: { create: { organizationId: orgA.id } },
    },
  });
  return {
    editor,
    team,
    groupA,
    groupB,
    foreignGroup,
    orgA,
    orgB,
    foreignOrg,
    contact,
  };
};

/** The contact as the database holds it, with its assignments. */
const snapshot = async (contactId: string) => {
  const contact = await db.contact.findUniqueOrThrow({
    where: { id: contactId },
    include: {
      emails: { orderBy: { email: "asc" } },
      groups: { orderBy: { groupId: "asc" } },
      organizations: { orderBy: { organizationId: "asc" } },
    },
  });
  return {
    name: contact.name,
    phone: contact.phone,
    city: contact.city,
    otherMargins: contact.otherMargins,
    groupId: contact.groupId,
    emails: contact.emails.map(({ email, kind }) => [email, kind]),
    groups: contact.groups.map(({ groupId }) => groupId),
    organizations: contact.organizations.map(
      ({ organizationId }) => organizationId,
    ),
  };
};

const history = (contactId: string) =>
  db.contactChangeLog.findMany({
    where: { contactId },
    orderBy: { fieldName: "asc" },
    select: { fieldName: true, oldValue: true, newValue: true, userId: true },
  });

test("an edit changes only what was sent, and records it once", async () => {
  const setup = await createEditSetup();
  const before = await snapshot(setup.contact.id);

  await service.updateContact(
    { contactId: setup.contact.id, teamId: setup.team.id, name: "Giulia C." },
    setup.editor.id,
    "Editor",
  );

  assert.deepEqual(await snapshot(setup.contact.id), {
    ...before,
    name: "Giulia C.",
  });
  assert.deepEqual(await history(setup.contact.id), [
    {
      fieldName: "name",
      oldValue: JSON.stringify("Giulia Conti"),
      newValue: JSON.stringify("Giulia C."),
      userId: setup.editor.id,
    },
  ]);
});

test("unchanged values sent with an edit leave no history", async () => {
  const setup = await createEditSetup();

  await service.updateContact(
    {
      contactId: setup.contact.id,
      teamId: setup.team.id,
      name: "Giulia Conti",
      city: "Hamburg",
      phone: "+49 30 1234",
    },
    setup.editor.id,
  );

  assert.deepEqual(
    (await history(setup.contact.id)).map(({ fieldName }) => fieldName),
    ["city"],
  );
});

test("an edit that fails partway changes nothing", async () => {
  const setup = await createEditSetup();
  const before = await snapshot(setup.contact.id);

  // The name is applied and logged before the organizations are checked.
  await assert.rejects(
    service.updateContact(
      {
        contactId: setup.contact.id,
        teamId: setup.team.id,
        name: "Changed",
        groupIds: [setup.groupB.id],
        organizationIds: [setup.foreignOrg.id],
      },
      setup.editor.id,
    ),
    /organizations could not be found/,
  );

  assert.deepEqual(await snapshot(setup.contact.id), before);
  assert.deepEqual(await history(setup.contact.id), []);
});

test("restricted fields change only for editors in a group allowed to see them", async () => {
  const setup = await createEditSetup();
  await db.contactFieldAccess.create({
    data: {
      teamId: setup.team.id,
      fieldKey: "otherMargins",
      groupId: setup.groupB.id,
    },
  });

  // The edit form sends a field it may not show as "" (the contact it
  // loaded had the field removed); neither that nor a value may land.
  for (const otherMargins of ["", "changed by someone without access"]) {
    await service.updateContact(
      {
        contactId: setup.contact.id,
        teamId: setup.team.id,
        name: "Giulia C.",
        otherMargins,
      },
      setup.editor.id,
    );
  }
  let stored = await snapshot(setup.contact.id);
  assert.equal(stored.name, "Giulia C.");
  assert.equal(stored.otherMargins, "none given");
  assert.ok(
    (await history(setup.contact.id)).every(
      ({ fieldName }) => fieldName !== "otherMargins",
    ),
  );

  await db.userGroup.create({
    data: { userId: setup.editor.id, groupId: setup.groupB.id },
  });
  await service.updateContact(
    {
      contactId: setup.contact.id,
      teamId: setup.team.id,
      otherMargins: "changed with access",
    },
    setup.editor.id,
  );
  stored = await snapshot(setup.contact.id);
  assert.equal(stored.otherMargins, "changed with access");
});

test("groups are replaced by exactly the ones sent, and the change is recorded", async () => {
  const setup = await createEditSetup();

  await service.updateContact(
    {
      contactId: setup.contact.id,
      teamId: setup.team.id,
      groupIds: [setup.groupB.id],
    },
    setup.editor.id,
  );
  let stored = await snapshot(setup.contact.id);
  assert.deepEqual(stored.groups, [setup.groupB.id]);
  assert.equal(stored.groupId, setup.groupB.id);
  assert.deepEqual(
    (await history(setup.contact.id)).map(({ fieldName }) => fieldName),
    ["groupIds"],
  );

  // An empty list removes every group: visible to the whole team again.
  await service.updateContact(
    { contactId: setup.contact.id, teamId: setup.team.id, groupIds: [] },
    setup.editor.id,
  );
  stored = await snapshot(setup.contact.id);
  assert.deepEqual(stored.groups, []);
  assert.equal(stored.groupId, null);
});

test("another team's group cannot be assigned", async () => {
  const setup = await createEditSetup();
  const before = await snapshot(setup.contact.id);

  await assert.rejects(
    service.updateContact(
      {
        contactId: setup.contact.id,
        teamId: setup.team.id,
        groupIds: [setup.groupB.id, setup.foreignGroup.id],
      },
      setup.editor.id,
    ),
    /do not belong to this team/,
  );
  assert.deepEqual(await snapshot(setup.contact.id), before);
  assert.deepEqual(await history(setup.contact.id), []);
});

test("organizations are replaced by exactly the ones sent", async () => {
  const setup = await createEditSetup();

  await service.updateContact(
    {
      contactId: setup.contact.id,
      teamId: setup.team.id,
      organizationIds: [setup.orgB.id, setup.orgB.id],
    },
    setup.editor.id,
  );
  assert.deepEqual((await snapshot(setup.contact.id)).organizations, [
    setup.orgB.id,
  ]);

  await service.updateContact(
    {
      contactId: setup.contact.id,
      teamId: setup.team.id,
      organizationIds: [setup.orgA.id, setup.orgB.id],
    },
    setup.editor.id,
  );
  assert.deepEqual(
    (await snapshot(setup.contact.id)).organizations,
    [setup.orgA.id, setup.orgB.id].sort(),
  );
});

test("an edit leaves other contacts' assignments alone", async () => {
  const setup = await createEditSetup();
  const neighbour = await db.contact.create({
    data: {
      teamId: setup.team.id,
      name: "Neighbour",
      emails: {
        create: {
          teamId: setup.team.id,
          email: "neighbour@example.org",
          kind: "PRIMARY",
        },
      },
      groups: { create: { groupId: setup.groupA.id } },
      organizations: { create: { organizationId: setup.orgA.id } },
    },
  });
  const before = await snapshot(neighbour.id);

  await service.updateContact(
    {
      contactId: setup.contact.id,
      teamId: setup.team.id,
      groupIds: [],
      organizationIds: [],
      email: "giulia.conti@example.org",
    },
    setup.editor.id,
  );

  assert.deepEqual(await snapshot(neighbour.id), before);
});

test("an e-mail address can belong to only one contact", async () => {
  const setup = await createEditSetup();
  await db.contact.create({
    data: {
      teamId: setup.team.id,
      name: "Neighbour",
      emails: {
        create: {
          teamId: setup.team.id,
          email: "neighbour@example.org",
          kind: "PRIMARY",
        },
      },
    },
  });
  const before = await snapshot(setup.contact.id);

  await assert.rejects(
    service.updateContact(
      {
        contactId: setup.contact.id,
        teamId: setup.team.id,
        email: "Neighbour@Example.org",
      },
      setup.editor.id,
    ),
    /already belongs to another contact/,
  );
  assert.deepEqual(await snapshot(setup.contact.id), before);
});
