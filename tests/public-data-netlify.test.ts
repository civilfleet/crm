import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deployEvents } from "../src/lib/public-events/netlify";

test("digest deployment describes all assets but uploads only requested contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "public-data-upload-"));
  const original = globalThis.fetch;
  const content = '{"schemaVersion":1}';
  const hash = createHash("sha1").update(content).digest("hex");
  const cached = "a".repeat(40);
  const inventory = {
    "manifest.json": hash,
    _headers: cached,
    "unchanged.json": cached,
  };
  const uploads: string[] = [];
  try {
    await writeFile(join(root, "manifest.json"), content);
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        assert.deepEqual(body.files, {
          "/manifest.json": hash,
          "/_headers": cached,
          "/unchanged.json": cached,
        });
        assert.equal(body.draft, true);
        return Response.json({
          id: "test-deploy",
          state: "prepared",
          required: [hash],
        });
      }
      if (init?.method === "PUT") {
        uploads.push(url);
        assert.equal(
          new TextDecoder().decode(init.body as Uint8Array),
          content,
        );
        return Response.json({});
      }
      return Response.json({ id: "test-deploy", state: "ready", required: [] });
    };
    const result = await deployEvents(
      "fixture-token",
      "fixture-site",
      root,
      "version",
      true,
      inventory,
    );
    assert.equal(result.state, "ready");
    assert.deepEqual(uploads, [
      "https://api.netlify.com/api/v1/deploys/test-deploy/files/manifest.json",
    ]);
  } finally {
    globalThis.fetch = original;
    await rm(root, { recursive: true, force: true });
  }
});

test("an incomplete data deployment fails before making any network request", async () => {
  await assert.rejects(
    deployEvents("fixture-token", "fixture-site", "/tmp", "version", true, {}),
    /incomplete public data/,
  );
});
