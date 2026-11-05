import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";

type HealthRoute = {
  GET: () => Promise<Response>;
};

const loadHealthRoute = (query: () => Promise<unknown>) =>
  loadModule<HealthRoute>("src/app/api/health/route.ts", {
    "@/lib/prisma": { $queryRaw: query },
  });

test("reports ready when the database responds", async () => {
  let queried = false;
  const route = loadHealthRoute(async () => {
    queried = true;
    return [{ "?column?": 1 }];
  });

  const response = await route.GET();

  assert.equal(queried, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("reports unavailable when the database query fails", async () => {
  const route = loadHealthRoute(async () => {
    throw new Error("database unavailable");
  });

  const response = await route.GET();

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
});

test("process liveness stays healthy during a database outage", async () => {
  const readiness = loadHealthRoute(async () => {
    throw new Error("database unavailable");
  });
  const liveness = loadModule<HealthRoute>(
    "src/app/api/health/live/route.ts",
    {},
  );
  assert.equal((await readiness.GET()).status, 503);
  assert.equal((await liveness.GET()).status, 200);
});
