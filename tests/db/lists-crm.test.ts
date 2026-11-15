import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  createFundingRequest,
  createUser,
  db,
  disconnect,
  loadService,
  resetDatabase,
} from "./helpers";

/*
  Users, files, events, contact lists and event registrations page, sort
  and filter on the server. Each page stays within its team, organization
  or event.
*/

type Sort = { field: string; direction: "asc" | "desc" };
type Result<T> = { data: T[]; total: number };

type UsersService = {
  getUsers: (
    scope: { teamId?: string; organizationId?: string },
    query: string,
    pagination?: { page: number; pageSize: number; sort?: Sort },
    filters?: {
      field?: string;
      groupIds?: string[];
      roles?: string[];
    },
  ) => Promise<Result<{ id: string; name: string | null }>>;
};
type FilesService = {
  getFiles: (
    scope: { teamId?: string; organizationId?: string },
    query: string,
    filters?: { types?: string[] },
  ) => Promise<Array<{ id: string }>>;
  getFilesPage: (
    scope: { teamId?: string; organizationId?: string },
    query: string,
    options: { page: number; pageSize: number; sort: Sort; types?: string[] },
  ) => Promise<
    Result<{ id: string; name: string | null }> & {
      types: Array<{ type: string; count: number }>;
    }
  >;
};
type EventsService = {
  getTeamEventsPage: (
    teamId: string,
    query: string | undefined,
    filters: {
      eventTypeIds?: string[];
      state?: string;
      from?: string;
      to?: string;
    },
    pagination: { page: number; pageSize: number; sort: Sort },
  ) => Promise<Result<{ id: string; title: string }>>;
  getEventRegistrationsPage: (
    eventId: string,
    teamId: string,
    query: string,
    pagination: { page: number; pageSize: number; sort: Sort },
  ) => Promise<Result<{ id: string; name: string }>>;
};
type ListsService = {
  getTeamContactListsPage: (
    teamId: string,
    userId: string | undefined,
    roles: string[],
    filters: { query?: string; types?: string[] },
    pagination: { page: number; pageSize: number; sort: Sort },
  ) => Promise<Result<{ id: string; name: string; contactCount: number }>>;
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const users = loadService<UsersService>("src/services/users/index.ts", {
  "@/lib/api-guard": { ApiError },
});
const files = loadService<FilesService>("src/services/file/index.ts");
const events = loadService<EventsService>("src/services/events/index.ts", {
  "@/lib/api-guard": { ApiError },
});
const lists = loadService<ListsService>("src/services/contact-lists/index.ts", {
  "@/lib/api-guard": { ApiError },
});

beforeEach(resetDatabase);
after(disconnect);

const page = { page: 1, pageSize: 50 };
const names = (rows: Array<{ name: string | null }>) =>
  rows.map(({ name }) => name);

const createTeam = (name: string) =>
  db.teams.create({
    data: { name, email: `${name.toLowerCase()}@example.org` },
  });

test("users: the team's people only, filtered by group, role and field", async () => {
  const team = await createTeam("Crew");
  const other = await createTeam("Other");
  const group = await db.group.create({
    data: { teamId: team.id, name: "Deck" },
  });
  const add = async (
    name: string | null,
    city: string | null,
    options: {
      roles?: Array<"Team" | "Admin">;
      group?: boolean;
      teamId?: string;
    } = {},
  ) => {
    const user = await db.user.create({
      data: {
        name,
        city,
        email: `${name ?? "anon"}-${city ?? "x"}@example.org`.toLowerCase(),
        roles: options.roles ?? ["Team"],
        teams: { connect: { id: options.teamId ?? team.id } },
      },
    });
    if (options.group) {
      await db.userGroup.create({
        data: { userId: user.id, groupId: group.id },
      });
    }
    return user;
  };
  await add("Bea", "Berlin", { group: true });
  await add("Ana", null, { roles: ["Admin", "Team"] });
  await add(null, "Hamburg");
  await add("Zed", "Berlin", { teamId: other.id });
  const scope = { teamId: team.id };

  // Empty names sort last in both directions.
  for (const direction of ["asc", "desc"] as const) {
    const sorted = await users.getUsers(scope, "", {
      ...page,
      sort: { field: "name", direction },
    });
    assert.equal(sorted.total, 3);
    assert.equal(names(sorted.data).at(-1), null);
  }
  assert.deepEqual(
    names(
      (await users.getUsers(scope, "", page, { groupIds: [group.id] })).data,
    ),
    ["Bea"],
  );
  assert.equal(
    (await users.getUsers(scope, "", page, { groupIds: ["none"] })).total,
    2,
  );
  assert.deepEqual(
    names((await users.getUsers(scope, "", page, { roles: ["Admin"] })).data),
    ["Ana"],
  );
  // "Berlin" in the city, but not in any name.
  assert.equal(
    (await users.getUsers(scope, "Berlin", page, { field: "city" })).total,
    1,
  );
  assert.equal(
    (await users.getUsers(scope, "Berlin", page, { field: "name" })).total,
    0,
  );
});

test("files: scope, type filter with counts, order and the full download", async () => {
  const setup = await createFundingRequest({ amountAgreed: 100 });
  const outsider = await createFundingRequest({ amountAgreed: 100 });
  const user = await createUser("Uploader");
  const file = (name: string, type: string, organizationId: string) =>
    db.file.create({
      data: {
        name,
        type,
        url: `files/${organizationId}/${name}`,
        organizationId,
        createdById: user.id,
        updatedById: user.id,
      },
    });
  await file("b-report.pdf", "REPORT", setup.organization.id);
  await file("a-report.pdf", "REPORT", setup.organization.id);
  await file("receipt.pdf", "TRANSACTION_RECEIPT", setup.organization.id);
  await file("not-yours.pdf", "REPORT", outsider.organization.id);
  const scope = { teamId: setup.team.id };

  const all = await files.getFilesPage(scope, "", {
    ...page,
    sort: { field: "name", direction: "asc" },
  });
  assert.deepEqual(names(all.data), [
    "a-report.pdf",
    "b-report.pdf",
    "receipt.pdf",
  ]);
  // The counts describe the list before the type filter.
  assert.deepEqual(all.types, [
    { type: "REPORT", count: 2 },
    { type: "TRANSACTION_RECEIPT", count: 1 },
  ]);

  const reports = await files.getFilesPage(scope, "", {
    ...page,
    sort: { field: "name", direction: "asc" },
    types: ["REPORT"],
  });
  assert.equal(reports.total, 2);
  assert.equal(reports.types.length, 2);

  // "Download all" takes what the filtered list shows, across every page.
  const download = await files.getFiles(scope, "", { types: ["REPORT"] });
  assert.equal(download.length, 2);
});

test("events: several types, state, start dates and order by registrations", async () => {
  const team = await createTeam("Events");
  const other = await createTeam("Elsewhere");
  const [talk, workshop] = await Promise.all(
    ["Talk", "Workshop"].map((name) =>
      db.eventType.create({ data: { teamId: team.id, name } }),
    ),
  );
  const event = (
    title: string,
    startDate: string,
    options: { type?: string; state?: string; teamId?: string } = {},
  ) =>
    db.event.create({
      data: {
        teamId: options.teamId ?? team.id,
        title,
        startDate: new Date(startDate),
        eventTypeId: options.type ?? null,
        state: options.state ?? null,
      },
    });
  const march = await event("March talk", "2027-03-10T18:00:00Z", {
    type: talk.id,
    state: "Bayern",
  });
  const may = await event("May workshop", "2027-05-02T09:00:00Z", {
    type: workshop.id,
    state: "Berlin",
  });
  await event("Open day", "2027-06-01T10:00:00Z");
  await event("Not ours", "2027-03-11T10:00:00Z", { teamId: other.id });
  const contact = await db.contact.create({
    data: { teamId: team.id, name: "Guest" },
  });
  for (const name of ["One", "Two"]) {
    await db.eventRegistration.create({
      data: {
        eventId: may.id,
        contactId: contact.id,
        name,
        email: `${name.toLowerCase()}@example.org`,
      },
    });
  }
  const read = (
    filters: Parameters<EventsService["getTeamEventsPage"]>[2],
    sort: Sort = { field: "startDate", direction: "asc" },
  ) => events.getTeamEventsPage(team.id, undefined, filters, { ...page, sort });
  const titles = (result: Result<{ title: string }>) =>
    result.data.map(({ title }) => title);

  assert.equal((await read({})).total, 3);
  assert.deepEqual(
    titles(await read({ eventTypeIds: [talk.id, workshop.id] })),
    ["March talk", "May workshop"],
  );
  assert.deepEqual(titles(await read({ state: "bay" })), ["March talk"]);
  // The end day counts whole.
  assert.deepEqual(
    titles(await read({ from: "2027-03-10", to: "2027-05-02" })),
    ["March talk", "May workshop"],
  );
  assert.deepEqual(
    titles(
      await read({}, { field: "registrationCount", direction: "desc" }),
    )[0],
    "May workshop",
  );
  assert.ok(march.id);
});

test("event registrations: only the event's, of the event's team", async () => {
  const team = await createTeam("Hosts");
  const other = await createTeam("Guests");
  const event = await db.event.create({
    data: { teamId: team.id, title: "Open day", startDate: new Date() },
  });
  const contact = await db.contact.create({
    data: { teamId: team.id, name: "Visitor" },
  });
  for (const name of ["Carla", "Ben", "Ada"]) {
    await db.eventRegistration.create({
      data: {
        eventId: event.id,
        contactId: contact.id,
        name,
        email: `${name.toLowerCase()}@example.org`,
      },
    });
  }
  const pagination = {
    page: 1,
    pageSize: 2,
    sort: { field: "name", direction: "asc" as const },
  };

  const first = await events.getEventRegistrationsPage(
    event.id,
    team.id,
    "",
    pagination,
  );
  assert.equal(first.total, 3);
  assert.deepEqual(names(first.data), ["Ada", "Ben"]);
  assert.deepEqual(
    names(
      (
        await events.getEventRegistrationsPage(
          event.id,
          team.id,
          "CARLA",
          pagination,
        )
      ).data,
    ),
    ["Carla"],
  );
  await assert.rejects(
    events.getEventRegistrationsPage(event.id, other.id, "", pagination),
    /Event not found/,
  );
});

test("contact lists: search, type and order by the number of people", async () => {
  const team = await createTeam("Lists");
  const admin = await createUser("Admin");
  const contacts = await Promise.all(
    ["A", "B", "C"].map((name) =>
      db.contact.create({ data: { teamId: team.id, name } }),
    ),
  );
  const list = (name: string, members: number) =>
    db.contactList.create({
      data: {
        teamId: team.id,
        name,
        type: "MANUAL",
        contacts: {
          create: contacts.slice(0, members).map((contact) => ({
            contactId: contact.id,
          })),
        },
      },
    });
  await list("Newsletter", 3);
  await list("Volunteers", 1);
  await list("Press", 2);
  const read = (
    filters: { query?: string; types?: string[] },
    sort: Sort = { field: "name", direction: "asc" },
  ) =>
    lists.getTeamContactListsPage(team.id, admin.id, ["Admin"], filters, {
      page: 1,
      pageSize: 2,
      sort,
    });

  const byCount = await read({}, { field: "contactCount", direction: "desc" });
  assert.equal(byCount.total, 3);
  assert.deepEqual(names(byCount.data), ["Newsletter", "Press"]);
  assert.deepEqual(names((await read({ query: "volun" })).data), [
    "Volunteers",
  ]);
  assert.equal((await read({ types: ["SMART"] })).total, 0);
});
