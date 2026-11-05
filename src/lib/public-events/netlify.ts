import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

export async function netlifyToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  if (process.env.EVENTS_USE_LOCAL_NETLIFY_LOGIN !== "true")
    throw new Error(
      "NETLIFY_AUTH_TOKEN is required for automated publication.",
    );
  const config = JSON.parse(
    await readFile(join(homedir(), ".config/netlify/config.json"), "utf8"),
  );
  const token: unknown = config.users?.[config.userId]?.auth?.token;
  if (typeof token !== "string" || !token)
    throw new Error("No saved Netlify login found.");
  return token;
}

export async function netlifyRequest<T>(
  path: string,
  token: string,
  method = "GET",
  body?: BodyInit,
  contentType = "application/json",
  attempt = 0,
): Promise<T> {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "User-Agent": "SeaWatch-PublicEvents/1.0",
    },
    body,
    signal: AbortSignal.timeout(60000),
  });
  if (response.status === 429 && attempt < 4) {
    const reset =
      Number(response.headers.get("x-ratelimit-reset") ?? 0) * 1000 -
      Date.now();
    const retry = Number(response.headers.get("retry-after") ?? 0) * 1000;
    await response.body?.cancel();
    await new Promise((done) =>
      setTimeout(
        done,
        Math.max(1000, Math.min(60000, retry || reset || 30000)),
      ),
    );
    return netlifyRequest<T>(
      path,
      token,
      method,
      body,
      contentType,
      attempt + 1,
    );
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        `Netlify ${method} ${path.split("?")[0]} failed: HTTP ${response.status}`,
      ),
      { code: `NETLIFY_HTTP_${response.status}` },
    );
  return response.json() as Promise<T>;
}

type Deployment = {
  id: string;
  state: string;
  required: string[];
  ssl_url?: string;
  deploy_ssl_url?: string;
  title?: string;
};
export async function deployEvents(
  token: string,
  siteId: string,
  directory: string,
  version: string,
  draft = true,
  inventory?: Record<string, string>,
) {
  const root = resolve(directory);
  const hashes: Record<string, string> = {};
  const files = new Map<string, string>();
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const hash = createHash("sha1")
          .update(await readFile(path))
          .digest("hex");
        const name = `/${relative(root, path).replaceAll("\\", "/")}`;
        hashes[name] = hash;
        files.set(hash, name);
      }
    }
  }
  if (inventory) {
    for (const [path, hash] of Object.entries(inventory)) {
      if (
        !/^[a-f0-9]{40}$/.test(hash) ||
        path.startsWith("/") ||
        path.split("/").includes("..")
      )
        throw new Error("Invalid deployment inventory");
      hashes[`/${path}`] = hash;
      files.set(hash, `/${path}`);
    }
  } else await walk(root);
  if (!hashes["/manifest.json"] || !hashes["/_headers"])
    throw new Error("Refusing to deploy an incomplete public data feed.");
  console.log(
    `Preparing ${Object.keys(hashes).length} public data assets for Netlify digest deployment.`,
  );
  let deployment = await netlifyRequest<Deployment>(
    `/sites/${siteId}/deploys`,
    token,
    "POST",
    JSON.stringify({
      files: hashes,
      draft,
      async: true,
      title: `public-data:${version}`,
    }),
  );
  for (let i = 0; deployment.state === "preparing" && i < 120; i++) {
    await new Promise((done) => setTimeout(done, 2000));
    deployment = await netlifyRequest<Deployment>(
      `/deploys/${deployment.id}`,
      token,
    );
  }
  if (deployment.state === "preparing")
    throw new Error(
      `Netlify deployment ${deployment.id} is still preparing; inspect before retrying.`,
    );
  for (let i = 0; i < (deployment.required?.length ?? 0); i += 8) {
    await Promise.all(
      deployment.required.slice(i, i + 8).map(async (hash) => {
        const name = files.get(hash);
        if (!name) throw new Error("Netlify requested an unknown file hash.");
        await netlifyRequest(
          `/deploys/${deployment.id}/files${name.split("/").map(encodeURIComponent).join("/")}`,
          token,
          "PUT",
          new Uint8Array(await readFile(join(root, name))),
          "application/octet-stream",
        );
      }),
    );
  }
  console.log(
    `Netlify deployment ${deployment.id} uploaded; waiting for processing.`,
  );
  for (let i = 0; i < 240; i++) {
    deployment = await netlifyRequest<Deployment>(
      `/deploys/${deployment.id}`,
      token,
    );
    if (deployment.state === "ready") return deployment;
    if (["error", "failed", "canceled"].includes(deployment.state))
      throw new Error(
        `Netlify deployment ${deployment.id}: ${deployment.state}`,
      );
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error(
    `Netlify deployment ${deployment.id} did not become ready; inspect it before retrying.`,
  );
}
