import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { netlifyRequest, netlifyToken } from "../src/lib/public-events/netlify";

async function main() {
  const file = "config/public-events.json";
  const config = JSON.parse(await readFile(file, "utf8"));
  if (config.siteId) {
    console.log(`Events site already configured: ${config.siteId}`);
    return;
  }
  const token = await netlifyToken();
  // Listing before creation also makes retries safe if a previous request
  // succeeded but the connection closed before we saved its response.
  const sites = await netlifyRequest<
    { id: string; name: string; ssl_url: string }[]
  >("/sea-watch/sites?per_page=100", token);
  let site = sites.find((item) => item.name === config.siteName);
  if (!site)
    site = await netlifyRequest<{ id: string; name: string; ssl_url: string }>(
      "/sea-watch/sites",
      token,
      "POST",
      JSON.stringify({
        name: config.siteName,
        force_ssl: true,
        processing_settings: { html: { pretty_urls: true } },
      }),
    );
  config.siteId = site.id;
  config.url = site.ssl_url || `https://${site.name}.netlify.app`;
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
  console.log(JSON.stringify({ siteId: site.id, url: config.url }));
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Site creation failed",
  );
  process.exitCode = 1;
});
