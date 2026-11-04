import "dotenv/config";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { exportEvents } from "./export-public-events";
import {
  deployEvents,
  netlifyRequest,
  netlifyToken,
} from "../src/lib/public-events/netlify";

export async function publishEvents(production = false) {
  const token = await netlifyToken();
  let siteId = process.env.NETLIFY_SITE_ID;
  if (!siteId) {
    const config = JSON.parse(
      await readFile("config/public-events.json", "utf8"),
    );
    siteId = config.siteId;
  }
  if (!siteId)
    throw new Error(
      "Configure the dedicated public-events Netlify site ID first.",
    );
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10000,
    ssl: process.env.PG_SSL_ROOT_CERT
      ? {
          ca: process.env.PG_SSL_ROOT_CERT.replace(/\\n/g, "\n"),
          rejectUnauthorized: true,
        }
      : undefined,
  });
  const client = await pool.connect();
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(731204, 1) AS locked",
    );
    if (!lock.rows[0].locked)
      throw new Error("Another event publisher is already running.");
    const pending = await netlifyRequest<
      { id: string; title?: string; state: string }[]
    >(`/sites/${siteId}/deploys?per_page=100`, token);
    if (
      pending.some(
        (deploy) =>
          deploy.title?.startsWith("public-events:") &&
          !["ready", "old", "error", "failed", "canceled", "rejected"].includes(
            deploy.state,
          ),
      )
    ) {
      throw new Error(
        "A previous event deployment is still processing. Inspect it before retrying; no newer deployment was started.",
      );
    }
    const data = await exportEvents();
    const site = await netlifyRequest<{
      published_deploy?: { title: string };
      ssl_url: string;
    }>(`/sites/${siteId}`, token);
    if (
      production &&
      site.published_deploy?.title === `public-events:${data.version}`
    ) {
      console.log("Public events are already current.");
      return;
    }
    await new Promise<void>((done, fail) => {
      const child = spawn(
        process.execPath,
        [".yarn/releases/yarn-4.14.1.cjs", "events:build"],
        {
          stdio: "inherit",
          env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
        },
      );
      child.on("error", fail);
      child.on("exit", (code) =>
        code === 0
          ? done()
          : fail(
              new Error(
                `Static build failed (${code}). Current live deployment retained.`,
              ),
            ),
      );
    });
    const deployment = await deployEvents(
      token,
      siteId,
      "public-events/out",
      data.version,
      !production,
    );
    console.log(
      JSON.stringify({
        deploymentId: deployment.id,
        state: deployment.state,
        production,
        url: production ? site.ssl_url : deployment.deploy_ssl_url,
      }),
    );
  } finally {
    await client.query("SELECT pg_advisory_unlock(731204, 1)").catch(() => {});
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("publish-public-events.ts"))
  publishEvents(process.argv.includes("--production")).catch(
    (error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "Publication failed",
      );
      process.exitCode = 1;
    },
  );
