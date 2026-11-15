import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  createUser,
  db,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

/*
  Contacts and organizations page, sort and filter on the server. Every
  page keeps the team scope and, for contacts, each person's group
  visibility; the trash is its own list.
*/

type Sort = { field: string; direction: "asc" | "desc" };
type Page = { page: number; pageSize: number; sort?: Sort };
type Result<T> = { data: T[]; total: number };

type ContactsService = {
  getTeamContacts: (
    teamId: string,
    query: string | undefined,
    userId: string | undefined,
    filters: unknown[] | undefined,
    roles: string[] | undefined,
    pagination: Page & { deletedOnly?: boolean },
  ) => Promise<Result<{ id: string; name: string; city?: string }>>;
};
type OrganizationsService = {
  getOrganizations: (
    query: string,
    teamId: string,
    filters: unknown[],
    pagination?: Page,
  ) => Promise<Result<{ id: string; name: string | null }>>;
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const contacts = loadService<ContactsService>(
  "src/services/contacts/index.ts",
  {
    "@/lib/api-guard": { ApiError },
  },
);
const organizations = loadService<OrganizationsService>(
  "src/services/organizations/index.ts",
  { "@/lib/api-guard": { ApiError }, "@/auth": { auth: async () => null } },
);

beforeEach(resetDatabase);
after(disconnect);

const names = (rows: Array<{ name: string | null }>) =>
  rows.map(({ name }) => name);

const createTeam = (name: string) =>
  db.teams.create({
    data: { name, email: `${name.toLowerCase()}@example.org` },
  });

/** A team with an admin, a restricted group and five contacts. */
const createContactsSetup = async () => {
  const team = await createTeam("People");
  const other = await createTeam("Others");
  const admin = await createUser("Admin");
  const member = await createUser("Member");
  const restricted = await db.group.create({
    data: { teamId: team.id, name: "Restricted" },
  });
  const contact = (
    name: string,
    city: string | null,
    extra: Record<string, unknown> = {},
  ) =>
    db.contact.create({
      data: { teamId: team.id, name, city, ...extra },
    });
  await contact("Carla", "Berlin");
  await contact("Ada", null);
  await contact("Ben", "Aachen", {
    attributes: {
      create: { key: "shirt", type: "STRING", stringValue: "M" },
    },
  });
  await contact("Dora", "Berlin", {
    groups: { create: { groupId: restricted.id } },
  });
  await contact("Eve", "Hamburg", { deletedAt: new Date() });
  await db.contact.create({
    data: { teamId: other.id, name: "Not ours", city: "Berlin" },
  });
  return { team, admin, member, restricted };
};

test("contacts: sorted pages of the team's active contacts", async () => {
  const { team, admin } = await createContactsSetup();
  const read = (sort: Sort, page = 1) =>
    contacts.getTeamContacts(team.id, undefined, admin.id, [], ["Admin"], {
      page,
      pageSize: 2,
      sort,
    });

  const first = await read({ field: "name", direction: "asc" });
  const second = await read({ field: "name", direction: "asc" }, 2);
  assert.equal(first.total, 4);
  assert.deepEqual(
    [...names(first.data), ...names(second.data)],
    ["Ada", "Ben", "Carla", "Dora"],
  );

  // No city sorts last, whichever the direction.
  for (const direction of ["asc", "desc"] as const) {
    const all = await contacts.getTeamContacts(
      team.id,
      undefined,
      admin.id,
      [],
      ["Admin"],
      { page: 1, pageSize: 10, sort: { field: "city", direction } },
    );
    assert.equal(names(all.data).at(-1), "Ada");
  }
});

test("contacts: field, attribute and group filters, and the trash", async () => {
  const { team, admin, restricted } = await createContactsSetup();
  const read = (filters: unknown[], deletedOnly = false) =>
    contacts.getTeamContacts(team.id, undefined, admin.id, filters, ["Admin"], {
      page: 1,
      pageSize: 10,
      sort: { field: "name", direction: "asc" },
      deletedOnly,
    });

  assert.deepEqual(
    names(
      (
        await read([
          {
            type: "contactField",
            field: "city",
            operator: "contains",
            value: "berl",
          },
        ])
      ).data,
    ),
    ["Carla", "Dora"],
  );
  assert.deepEqual(
    names(
      (
        await read([
          { type: "contactField", field: "city", operator: "missing" },
        ])
      ).data,
    ),
    ["Ada"],
  );
  assert.deepEqual(
    names(
      (
        await read([
          { type: "attribute", key: "shirt", operator: "equals", value: "M" },
        ])
      ).data,
    ),
    ["Ben"],
  );
  assert.deepEqual(
    names((await read([{ type: "group", groupId: restricted.id }])).data),
    ["Dora"],
  );
  assert.deepEqual(names((await read([], true)).data), ["Eve"]);
});

test("contacts: a member sees no contact of a group they are not in, on any page", async () => {
  const { team, member } = await createContactsSetup();

  const result = await contacts.getTeamContacts(
    team.id,
    undefined,
    member.id,
    [],
    [],
    { page: 1, pageSize: 10, sort: { field: "name", direction: "asc" } },
  );
  assert.equal(result.total, 3);
  assert.deepEqual(names(result.data), ["Ada", "Ben", "Carla"]);
});

test("organizations: the team's, sorted with empty names last, and field filters", async () => {
  const team = await createTeam("Partners");
  const other = await createTeam("Strangers");
  const organization = (name: string | null, email: string, teamId = team.id) =>
    db.organization.create({ data: { name, email, teamId } });
  const harbour = await organization("Harbour Aid", "harbour@example.org");
  const anchor = await organization("Anchor", "anchor@example.org");
  await organization(null, "unnamed@example.org");
  await organization("Alien", "alien@example.org", other.id);
  await db.organizationFieldValue.createMany({
    data: [
      {
        organizationId: harbour.id,
        key: "members",
        type: "NUMBER",
        numberValue: 80,
      },
      {
        organizationId: anchor.id,
        key: "members",
        type: "NUMBER",
        numberValue: 12,
      },
    ],
  });

  for (const direction of ["asc", "desc"] as const) {
    const sorted = await organizations.getOrganizations("", team.id, [], {
      page: 1,
      pageSize: 10,
      sort: { field: "name", direction },
    });
    assert.equal(sorted.total, 3);
    assert.equal(names(sorted.data).at(-1), null);
  }

  const large = await organizations.getOrganizations(
    "",
    team.id,
    [{ type: "field", key: "members", operator: "gt", value: "50" }],
    { page: 1, pageSize: 10 },
  );
  assert.deepEqual(names(large.data), ["Harbour Aid"]);

  const searched = await organizations.getOrganizations("ANCHOR", team.id, [], {
    page: 1,
    pageSize: 10,
  });
  assert.deepEqual(names(searched.data), ["Anchor"]);
});
