import "dotenv/config";
import { readFile } from "node:fs/promises";
import { netlifyRequest, netlifyToken } from "../src/lib/public-events/netlify";

// Operator-run cutover command; never invoked by the recurring publisher.
async function main() {
  const config = JSON.parse(
    await readFile("config/public-events.json", "utf8"),
  ) as { siteId: string; siteName: string };
  const token = await netlifyToken();
  const site = await netlifyRequest<{ name: string; ssl_url: string }>(
    `/sites/${config.siteId}`,
    token,
  );
  if (site.name === config.siteName) {
    console.log(site.ssl_url);
    return;
  }
  const updated = await netlifyRequest<{ ssl_url: string }>(
    `/sites/${config.siteId}`,
    token,
    "PATCH",
    JSON.stringify({ name: config.siteName }),
  );
  console.log(updated.ssl_url);
}
main().catch(() => {
  console.error(
    "Netlify rename failed; inspect site name availability and token permissions.",
  );
  process.exitCode = 1;
});
