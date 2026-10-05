import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";

type UsersRoute = {
  GET: (request: Request) => Promise<Response>;
};

test("group options request avoids loading full group memberships", async () => {
  const calls: string[] = [];
  const route = loadModule<UsersRoute>("src/app/api/groups/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/api-guard": {
      handleApiError: () => null,
      verifyTeamAccess: async (teamId: string) => calls.push(`guard:${teamId}`),
    },
    "@/lib/utils": {
      handlePrismaError: (error: Error) => ({ message: error.message }),
    },
    "@/services/groups": {
      getTeamGroupOptions: async () => {
        calls.push("options");
        return [{ id: "group-a", name: "Operations" }];
      },
      getTeamGroups: async () => {
        calls.push("full");
        return [];
      },
    },
    "@/validations/groups": {},
  });

  const response = await route.GET(
    new Request(
      "https://test.invalid/api/groups?teamId=team-a&optionsOnly=true",
    ),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: [{ id: "group-a", name: "Operations" }],
  });
  assert.deepEqual(calls, ["guard:team-a", "options"]);
});

test("users route forwards field and group filters with pagination", async () => {
  let getUsersArguments: unknown[] | undefined;
  const route = loadModule<UsersRoute>("src/app/api/users/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/constants/app": {},
    "@/lib/api-guard": {
      handleApiError: () => null,
      verifyTeamAccess: async () => undefined,
    },
    "@/lib/nodemailer": {},
    "@/lib/utils": {
      handlePrismaError: (error: Error) => ({ message: error.message }),
    },
    "@/services/teams": { ensureTeamOwner: async () => "owner-a" },
    "@/services/users": {
      getUsers: async (...args: unknown[]) => {
        getUsersArguments = args;
        return { data: [], total: 0 };
      },
    },
    "@/types": { Roles: {} },
    "@/validations/organizations": {},
  });

  const response = await route.GET(
    new Request(
      "https://test.invalid/api/users?teamId=team-a&query=Berlin&field=city&groupId=group-a&page=2&pageSize=50",
    ),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(getUsersArguments, [
    { teamId: "team-a", organizationId: undefined },
    "Berlin",
    { page: 2, pageSize: 50 },
    { field: "city", groupId: "group-a" },
  ]);
});

test("user query combines team, group, and selected-field filters", async () => {
  let capturedWhere: unknown;
  const service = loadModule<{
    getUsers: (
      scope: { teamId: string },
      query: string,
      pagination: { page: number; pageSize: number },
      filters: { field: string; groupId: string },
    ) => Promise<unknown>;
  }>("src/services/users/index.ts", {
    "@/lib/prisma": {
      user: {
        findMany: async ({ where }: { where: unknown }) => {
          capturedWhere = where;
          return [];
        },
        count: async () => 0,
      },
    },
    "@/services/groups": { ensureDefaultGroup: async () => undefined },
    "@/types": { DEFAULT_TEAM_MODULES: [], Roles: {} },
  });

  await service.getUsers(
    { teamId: "team-a" },
    " Berlin ",
    { page: 1, pageSize: 20 },
    { field: "city", groupId: "group-a" },
  );

  assert.deepEqual(capturedWhere, {
    AND: [
      { teams: { some: { id: "team-a" } } },
      {
        groups: {
          some: {
            groupId: "group-a",
            group: { teamId: "team-a" },
          },
        },
      },
      {
        city: {
          contains: "Berlin",
          mode: "insensitive",
        },
      },
    ],
  });
});

test("no-group filter is limited to memberships in the current team", async () => {
  let capturedWhere: { AND: unknown[] } | undefined;
  const service = loadModule<{
    getUsers: (
      scope: { teamId: string },
      query: string,
      pagination: { page: number; pageSize: number },
      filters: { groupId: string },
    ) => Promise<unknown>;
  }>("src/services/users/index.ts", {
    "@/lib/prisma": {
      user: {
        findMany: async ({ where }: { where: { AND: unknown[] } }) => {
          capturedWhere = where;
          return [];
        },
        count: async () => 0,
      },
    },
    "@/services/groups": { ensureDefaultGroup: async () => undefined },
    "@/types": { DEFAULT_TEAM_MODULES: [], Roles: {} },
  });

  await service.getUsers(
    { teamId: "team-a" },
    "",
    { page: 1, pageSize: 20 },
    { groupId: "none" },
  );

  assert.deepEqual(capturedWhere?.AND[1], {
    groups: { none: { group: { teamId: "team-a" } } },
  });
});
