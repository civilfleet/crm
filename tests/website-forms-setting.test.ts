import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { loadModule } from "./helpers/load-module";

/*
  Team Settings → Integrations → Website forms: only team admins may switch
  whether the team accepts website form submissions, and each change is
  logged.
*/

type Route = {
  GET: (request: Request, context: unknown) => Promise<Response>;
  PATCH: (request: Request, context: unknown) => Promise<Response>;
};

const TEAM = "a10957f3-9d42-4b67-b31c-8bed001777ff";
const context = { params: Promise.resolve({ teamId: TEAM }) };

const setup = ({ admin = true, signedIn = true } = {}) => {
  const team = { id: TEAM, publicFormsEnabled: false };
  const logs: Array<Record<string, unknown>> = [];
  const route = loadModule<Route>(
    "src/app/api/teams/[teamId]/website-forms/route.ts",
    {
      "next/server": { NextResponse: { json: Response.json } },
      zod: { z },
      "@/auth": {
        auth: async () =>
          signedIn
            ? { user: { userId: "user-1", name: "Admin", roles: [] } }
            : null,
      },
      "@/lib/prisma": {
        teams: {
          findUnique: async () => ({ ...team }),
          update: async ({
            data,
          }: {
            data: { publicFormsEnabled: boolean };
          }) => {
            team.publicFormsEnabled = data.publicFormsEnabled;
            return { ...team };
          },
        },
      },
      "@/services/system-logs": {
        recordSystemLog: async (entry: Record<string, unknown>) => {
          logs.push(entry);
        },
      },
      "@/services/teams/access": {
        getTeamAdminAccess: async () => ({ allowed: admin }),
      },
    },
  );
  return { route, team, logs };
};

const patch = (body: unknown) =>
  new Request(`http://crm.test/api/teams/${TEAM}/website-forms`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

test("a team admin switches website forms on, and it is logged", async () => {
  const { route, team, logs } = setup();
  const read = await route.GET(new Request("http://crm.test"), context);
  assert.deepEqual((await read.json()).data, { teamId: TEAM, enabled: false });

  const response = await route.PATCH(patch({ enabled: true }), context);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, {
    teamId: TEAM,
    enabled: true,
  });
  assert.equal(team.publicFormsEnabled, true);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, "website_forms_enabled");
  assert.equal(logs[0].teamId, TEAM);
});

test("others cannot read or change it; bad input changes nothing", async () => {
  const notAdmin = setup({ admin: false });
  assert.equal(
    (await notAdmin.route.PATCH(patch({ enabled: true }), context)).status,
    403,
  );
  assert.equal(
    (await notAdmin.route.GET(new Request("http://crm.test"), context)).status,
    403,
  );
  assert.equal(notAdmin.team.publicFormsEnabled, false);

  const signedOut = setup({ signedIn: false });
  assert.equal(
    (await signedOut.route.PATCH(patch({ enabled: true }), context)).status,
    401,
  );

  const admin = setup();
  for (const body of [{ enabled: "yes" }, { enabled: true, extra: 1 }, null])
    assert.equal((await admin.route.PATCH(patch(body), context)).status, 400);
  assert.equal(admin.team.publicFormsEnabled, false);
  assert.equal(admin.logs.length, 0);
});
