import assert from "node:assert/strict";
import test from "node:test";
import yauzl from "yauzl";
import { createZipBuffer } from "../lib/zip";

const openZip = (buffer: Buffer) =>
  new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipFile) => {
      if (error) {
        reject(error);
        return;
      }

      if (!zipFile) {
        reject(new Error("Zip file could not be opened"));
        return;
      }

      resolve(zipFile);
    });
  });

const readEntry = (zipFile: yauzl.ZipFile, entry: yauzl.Entry) =>
  new Promise<string>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      if (!stream) {
        reject(new Error(`Could not read zip entry ${entry.fileName}`));
        return;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.once("error", reject);
      stream.once("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
  });

const unzipEntries = async (buffer: Buffer) => {
  const zipFile = await openZip(buffer);

  return new Promise<Array<{ fileName: string; contents: string }>>(
    (resolve, reject) => {
      const entries: Array<{ fileName: string; contents: string }> = [];

      zipFile.once("error", reject);
      zipFile.once("end", () => {
        resolve(entries);
      });
      zipFile.on("entry", async (entry) => {
        try {
          const contents = await readEntry(zipFile, entry);
          entries.push({ fileName: entry.fileName, contents });
          zipFile.readEntry();
        } catch (error) {
          reject(error);
        }
      });

      zipFile.readEntry();
    },
  );
};

test("createZipBuffer creates a readable zip archive with all entries", async () => {
  const archive = createZipBuffer([
    {
      name: "report.txt",
      data: Buffer.from("Quarterly report"),
    },
    {
      name: "nested/summary.json",
      data: Buffer.from('{"ok":true}'),
    },
  ]);

  const entries = await unzipEntries(archive);

  assert.deepEqual(entries, [
    { fileName: "report.txt", contents: "Quarterly report" },
    { fileName: "nested/summary.json", contents: '{"ok":true}' },
  ]);
});

test("createZipBuffer can represent an empty archive", async () => {
  const archive = createZipBuffer([]);
  const entries = await unzipEntries(archive);

  assert.deepEqual(entries, []);
});
