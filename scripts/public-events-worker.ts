import "dotenv/config";
import { Pool } from "pg";
import { reconcilePublication } from "../src/lib/public-data/queue";
import { databaseOptions } from "../src/lib/public-data/runtime";
import { publishEvents } from "./publish-public-events";

async function main() {
  const pool = new Pool(databaseOptions());
  let reconciledDay = "",
    stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  let retryAt = 0,
    retryMs = 30000;
  try {
    while (!stopping) {
      if (Date.now() >= retryAt) {
        try {
          const day = new Date().toISOString().slice(0, 10);
          const reconcile = day !== reconciledDay;
          if (reconcile) {
            const client = await pool.connect();
            try {
              await reconcilePublication(client);
            } finally {
              client.release();
            }
          }
          // Reconciliation refreshes references and catches changes outside event writes.
          const published = await publishEvents(true, {
            queued: true,
            reconcile,
          });
          if (published) console.log("Public data publication current.");
          if (!reconcile || published) reconciledDay = day;
          retryMs = 30000;
          retryAt = 0;
        } catch {
          console.error(
            "Public data publication failed; queued revisions retained. Check publisher configuration and the active Netlify deployment.",
          );
          retryAt = Date.now() + retryMs;
          retryMs = Math.min(retryMs * 2, 900000);
        }
      }
      await new Promise((done) => setTimeout(done, 5000));
    }
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Public data publisher stopped; check its runtime configuration.",
  );
  process.exitCode = 1;
});
