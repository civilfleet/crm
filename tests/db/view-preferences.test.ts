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
  Saved views: a person reads and writes only their own, and only for a
  team, organization or admin list they can open.
*/

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Response = { status: number; body: { data?: unknown } };
type Route = {
  GET: (request: Request) => Promise<Response>;
  PUT: (request: Request) => Promise<Response>;
};

const TEAM = "4a687998-3d5c-4187-aa0b-10bbe1eeb545";
const OTHER_TEAM = "5b798aa9-4e6d-4298-bb1c-21ccf2ffc656";

let signedIn = "";
let isAdmin = false;
const memberOf = new Set<string>();

const route = loadService<Route>("src/app/api/view-preferences/route.ts", {
  "next/server": {
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => ({
        status: init?.status ?? 200,
        body,
      }),
    },
  },
  "@/lib/api-guard": {
    ApiError,
    getAuthenticatedSession: async () => {
      if (!signedIn) throw new ApiError(401, "Unauthorized");
      return { user: { userId: signedIn } };
    },
    requireGlobalAdmin: async () => {
      if (!isAdmin) throw new ApiError(403, "Forbidden");
    },
    verifyTeamAccess: async (teamId: string) => {
      if (!memberOf.has(teamId)) throw new ApiError(403, "Forbidden");
    },
    verifyOrganizationAccess: async (organizationId: string) => {
      if (!memberOf.has(organizationId)) throw new ApiError(403, "Forbidden");
    },
    handleApiError: (error: unknown) =>
      error instanceof ApiError
        ? { status: error.status, body: { error: error.message } }
        : null,
  },
});

beforeEach(async () => {
  await resetDatabase();
  signedIn = "";
  isAdmin = false;
  memberOf.clear();
});
after(disconnect);

const key = (teamId = TEAM) => `transactions:team:${teamId}`;
const get = (viewKey: string) =>
  route.GET(
    new Request(
      `http://localhost/api/view-preferences?key=${encodeURIComponent(viewKey)}`,
    ),
  );
const put = (body: unknown) =>
  route.PUT(
    new Request("http://localhost/api/view-preferences", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );

test("a saved view is stored per person and list, and read back", async () => {
  const [anna, ben] = [await createUser("Anna"), await createUser("Ben")];
  memberOf.add(TEAM);

  signedIn = anna.id;
  assert.deepEqual((await get(key())).body, { data: null });
  const settings = { sort: { field: "amount", direction: "desc" } };
  assert.equal((await put({ key: key(), settings })).status, 200);
  // Saving again replaces it.
  const changed = { ...settings, columns: { receipt: false } };
  assert.equal((await put({ key: key(), settings: changed })).status, 200);
  assert.deepEqual((await get(key())).body, { data: changed });

  // Ben's view of the same list is his own.
  signedIn = ben.id;
  assert.deepEqual((await get(key())).body, { data: null });
  assert.equal(await db.userViewPreference.count(), 1);
});

test("no view for a team, organization or admin list the person cannot open", async () => {
  const anna = await createUser("Anna");
  signedIn = anna.id;
  memberOf.add(TEAM);

  for (const viewKey of [
    key(OTHER_TEAM),
    `funding-requests:org:${OTHER_TEAM}`,
    "teams:admin",
  ]) {
    assert.equal((await get(viewKey)).status, 403, viewKey);
    assert.equal(
      (await put({ key: viewKey, settings: { view: "table" } })).status,
      403,
      viewKey,
    );
  }
  assert.equal(await db.userViewPreference.count(), 0);

  isAdmin = true;
  assert.equal(
    (await put({ key: "teams:admin", settings: { view: "table" } })).status,
    200,
  );
});

test("bad keys, bad settings and strangers are refused", async () => {
  const anna = await createUser("Anna");
  memberOf.add(TEAM);

  assert.equal((await get(key())).status, 401);

  signedIn = anna.id;
  assert.equal((await get("transactions")).status, 400);
  assert.equal(
    (await put({ key: key(), settings: { theme: "dark" } })).status,
    400,
  );
  const huge = {
    columns: Object.fromEntries(
      Array.from({ length: 2000 }, (_, index) => [`column-${index}`, true]),
    ),
  };
  assert.equal((await put({ key: key(), settings: huge })).status, 413);
  assert.equal(await db.userViewPreference.count(), 0);
});

test("a person's saved views go with them", async () => {
  const anna = await createUser("Anna");
  signedIn = anna.id;
  memberOf.add(TEAM);
  await put({ key: key(), settings: { view: "table" } });

  await db.user.delete({ where: { id: anna.id } });
  assert.equal(await db.userViewPreference.count(), 0);
});
