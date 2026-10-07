import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "../../../../../tests/helpers/load-module";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type SettingsRoute = {
  GET: () => Promise<Response>;
  PATCH: (request: Request) => Promise<Response>;
};

const loadSettingsRoute = (authorized: boolean, calls: string[]) =>
  loadModule<SettingsRoute>("src/app/api/admin/settings/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/api-guard": {
      requireGlobalAdmin: async () => {
        calls.push("authorize");
        if (!authorized) throw new ApiError(403, "Forbidden");
      },
      handleApiError: (error: unknown) =>
        error instanceof ApiError
          ? Response.json({ error: error.message }, { status: error.status })
          : null,
    },
    "@/lib/global-settings": {
      getGlobalSettings: async () => {
        calls.push("read");
        return { accountCreationContactUrl: "mailto:support@example.org" };
      },
      updateGlobalSettings: async (input: object) => {
        calls.push("write");
        return input;
      },
    },
    "@/lib/logger": { error() {} },
    "@/validations/global-settings": {
      globalSettingsSchema: { parse: (input: object) => input },
    },
  });

test("global settings API authorizes before reading or writing", async () => {
  const calls: string[] = [];
  const deniedRoute = loadSettingsRoute(false, calls);

  assert.equal((await deniedRoute.GET()).status, 403);
  assert.equal(
    (
      await deniedRoute.PATCH(
        new Request("https://test.invalid/api/admin/settings", {
          method: "PATCH",
          body: JSON.stringify({
            accountCreationContactUrl: "https://support.example.org",
          }),
        }),
      )
    ).status,
    403,
  );
  assert.deepEqual(calls, ["authorize", "authorize"]);

  calls.length = 0;
  const allowedRoute = loadSettingsRoute(true, calls);
  assert.equal((await allowedRoute.GET()).status, 200);
  assert.equal(
    (
      await allowedRoute.PATCH(
        new Request("https://test.invalid/api/admin/settings", {
          method: "PATCH",
          body: JSON.stringify({
            accountCreationContactUrl: "https://support.example.org",
          }),
        }),
      )
    ).status,
    200,
  );
  assert.deepEqual(calls, ["authorize", "read", "authorize", "write"]);
});
