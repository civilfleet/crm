import "dotenv/config";
import { readFile, rm } from "node:fs/promises";
import { validateFeed } from "../src/lib/public-data/build";
import {
  completePublication,
  failPublication,
  type PublicationRequest,
  pendingPublication,
} from "../src/lib/public-data/queue";
import {
  createPublicDataPool,
  loadPublishedCache,
  promotePublishedCache,
} from "../src/lib/public-data/runtime";
import {
  deployEvents,
  netlifyRequest,
  netlifyToken,
} from "../src/lib/public-events/netlify";
import { exportEvents } from "./export-public-events";

export async function publishEvents(
  production = false,
  options: { queued?: boolean; reconcile?: boolean } = {},
) {
  const config = JSON.parse(
    await readFile("config/public-events.json", "utf8"),
  ) as { siteId: string; registrationApi: string };
  const pool = createPublicDataPool();
  const client = await pool.connect().catch(async (error: unknown) => {
    await pool.end();
    console.error("Public data publisher could not connect to its database.");
    throw error;
  });
  let locked = false,
    requests: PublicationRequest[] = [],
    transaction = false;
  let result: Awaited<ReturnType<typeof exportEvents>> | undefined;
  let promoted = false;
  let phase = "database and cache lookup";
  try {
    locked = (
      await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(731204, 1) AS locked",
      )
    ).rows[0].locked;
    if (!locked) return false;
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transaction = true;
    requests = await pendingPublication(client, options.queued ? 30 : 0);
    const previous = await loadPublishedCache();
    if (options.queued && !requests.length && previous && !options.reconcile) {
      await client.query("COMMIT");
      transaction = false;
      return false;
    }
    phase = "data generation";
    result = await exportEvents({
      client,
      teamIds:
        options.queued && previous ? requests.map((r) => r.teamId) : null,
      reconcile: options.reconcile,
      registrationApi: config.registrationApi,
    });
    await client.query("COMMIT");
    transaction = false;
    await validateFeed(result.output, result.state.files);
    phase = "Netlify publication";
    const token = await netlifyToken();
    const site = await netlifyRequest<{
      published_deploy?: { id: string; title?: string };
      ssl_url: string;
    }>(`/sites/${config.siteId}`, token);
    const unchanged =
      production &&
      previous?.state.version === result.state.version &&
      site.published_deploy?.title === `public-data:${result.state.version}`;
    if (!unchanged) {
      const pending = await netlifyRequest<
        { id: string; state: string; title?: string }[]
      >(`/sites/${config.siteId}/deploys?per_page=100`, token);
      for (const candidate of pending) {
        if (
          !/^(public-data|public-events):/.test(candidate.title ?? "") ||
          ["ready", "old", "error", "failed", "canceled", "rejected"].includes(
            candidate.state,
          )
        )
          continue;
        // Holding the DB publication lock excludes a healthy concurrent publisher.
        // Cancel only our own incomplete digest upload, never a published deployment.
        if (
          candidate.title?.startsWith("public-data:") &&
          candidate.state === "preparing" &&
          candidate.id !== site.published_deploy?.id
        ) {
          const detail = await netlifyRequest<{ required?: string[] }>(
            `/deploys/${candidate.id}`,
            token,
          );
          if (detail.required?.length) {
            await netlifyRequest(
              `/deploys/${candidate.id}/cancel`,
              token,
              "POST",
            );
            continue;
          }
        }
        throw new Error("An earlier public deployment is still processing");
      }
      const deployment = await deployEvents(
        token,
        config.siteId,
        result.output,
        result.state.version,
        !production,
        result.state.files,
      );
      if (production) {
        const active = await netlifyRequest<{
          published_deploy?: { id: string };
        }>(`/sites/${config.siteId}`, token);
        if (active.published_deploy?.id !== deployment.id)
          throw Object.assign(
            new Error(
              "Candidate is ready but not published; check Netlify deployment locks",
            ),
            { code: "NETLIFY_DEPLOY_NOT_ACTIVE" },
          );
      }
      console.log(
        JSON.stringify({
          deploymentId: deployment.id,
          state: deployment.state,
          production,
          url: production ? site.ssl_url : deployment.deploy_ssl_url,
        }),
      );
    }
    if (production) {
      phase = "cache promotion";
      await promotePublishedCache(result.run);
      promoted = true;
      phase = "queue acknowledgement";
      await completePublication(client, requests);
      if (result.previous)
        await rm(result.previous.run, { recursive: true, force: true });
    }
    return true;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "UNKNOWN";
    console.error(
      `Public data publication failed during ${phase}.`,
      /^[A-Z0-9_]{1,64}$/.test(code) ? code : "UNKNOWN",
    );
    if (transaction) await client.query("ROLLBACK");
    if (production && requests.length) await failPublication(client, requests);
    throw error;
  } finally {
    // Keep draft output for inspection. Always release the DB lock, even if cache cleanup fails.
    try {
      if (production && result && !promoted)
        await rm(result.runDirectory, { recursive: true, force: true });
    } finally {
      try {
        if (locked) await client.query("SELECT pg_advisory_unlock(731204, 1)");
      } finally {
        client.release();
        await pool.end();
      }
    }
  }
}
if (process.argv[1]?.endsWith("publish-public-events.ts")) {
  publishEvents(process.argv.includes("--production")).catch(() => {
    console.error(
      "Public data publication failed; queued revisions retained. Check migrations, cache and the active Netlify deployment before retrying.",
    );
    process.exitCode = 1;
  });
}
