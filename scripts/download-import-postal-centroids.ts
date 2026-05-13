import "dotenv/config";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import https from "node:https";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import yauzl from "yauzl";
import logger from "../lib/logger";

const DEFAULT_URL = "https://download.geonames.org/export/zip/allCountries.zip";
const ZIP_NAME = "allCountries.zip";
const EXTRACTED_NAME = "allCountries.txt";

const downloadFile = async (url: string, destination: string) => {
  await new Promise<void>((resolvePromise, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(
            new Error(`Download failed (${response.statusCode}) from ${url}`),
          );
          response.resume();
          return;
        }

        pipeline(response, createWriteStream(destination))
          .then(() => resolvePromise())
          .catch(reject);
      })
      .on("error", reject);
  });
};

const extractPostalFile = async (zipPath: string, destination: string) => {
  await new Promise<void>((resolvePromise, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(error ?? new Error("Failed to open zip file."));
        return;
      }

      let resolved = false;

      const finish = (err?: Error) => {
        if (resolved) {
          return;
        }
        resolved = true;
        zipfile.close();
        if (err) {
          reject(err);
        } else {
          resolvePromise();
        }
      };

      zipfile.on("entry", (entry) => {
        if (entry.fileName === EXTRACTED_NAME) {
          zipfile.openReadStream(entry, (streamError, readStream) => {
            if (streamError || !readStream) {
              finish(streamError ?? new Error("Failed to read zip entry."));
              return;
            }
            pipeline(readStream, createWriteStream(destination))
              .then(() => finish())
              .catch((err) => finish(err));
          });
          return;
        }

        zipfile.readEntry();
      });

      zipfile.on("end", () => {
        finish(new Error(`Could not find ${EXTRACTED_NAME} in zip.`));
      });

      zipfile.readEntry();
    });
  });
};

const importPostalData = async (
  databaseUrl: string,
  postalFilePath: string,
) => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('TRUNCATE TABLE "PostalCodeCentroid"');

    await client.query(`
      CREATE TEMP TABLE "PostalCodeCentroidImport" (
        "countryCode" CHAR(2) NOT NULL,
        "postalCode" VARCHAR(32) NOT NULL,
        "placeName" VARCHAR(255),
        "admin1" VARCHAR(255),
        "admin1Code" VARCHAR(50),
        "admin2" VARCHAR(255),
        "admin2Code" VARCHAR(50),
        "admin3" VARCHAR(255),
        "admin3Code" VARCHAR(50),
        "latitude" DECIMAL(9, 6),
        "longitude" DECIMAL(9, 6),
        "accuracy" INTEGER
      ) ON COMMIT PRESERVE ROWS;
    `);

    const copyStream = (
      client as unknown as { query: (query: unknown) => NodeJS.WritableStream }
    ).query(
      copyFrom(`COPY "PostalCodeCentroidImport"(
        "countryCode",
        "postalCode",
        "placeName",
        "admin1",
        "admin1Code",
        "admin2",
        "admin2Code",
        "admin3",
        "admin3Code",
        "latitude",
        "longitude",
        "accuracy"
      ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', NULL '', QUOTE E'\\b')`),
    );

    await pipeline(createReadStream(postalFilePath), copyStream);

    await client.query(`
      INSERT INTO "PostalCodeCentroid" (
        "countryCode",
        "postalCode",
        "placeName",
        "admin1",
        "admin1Code",
        "admin2",
        "admin2Code",
        "admin3",
        "admin3Code",
        "latitude",
        "longitude",
        "accuracy"
      )
      SELECT
        "countryCode",
        "postalCode",
        "placeName",
        "admin1",
        "admin1Code",
        "admin2",
        "admin2Code",
        "admin3",
        "admin3Code",
        "latitude",
        "longitude",
        "accuracy"
      FROM "PostalCodeCentroidImport"
      ON CONFLICT ("countryCode", "postalCode") DO NOTHING;
    `);
  } finally {
    await client.end();
  }
};

const run = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const tempRoot = join(tmpdir(), "postal-centroids");
  await mkdir(tempRoot, { recursive: true });

  const zipPath = join(tempRoot, ZIP_NAME);
  const extractedPath = join(tempRoot, EXTRACTED_NAME);

  const providedPostalFile = process.env.POSTAL_FILE;
  const resolvedPostalFile = providedPostalFile
    ? resolve(providedPostalFile)
    : undefined;
  const postalFilePath = resolvedPostalFile ?? extractedPath;
  const isProvidedZip =
    resolvedPostalFile && extname(resolvedPostalFile).toLowerCase() === ".zip";
  const shouldCleanup = !providedPostalFile || Boolean(isProvidedZip);

  if (!providedPostalFile) {
    const url = process.env.POSTAL_URL ?? DEFAULT_URL;

    logger.info({ url }, "Downloading postal centroid data");
    await downloadFile(url, zipPath);

    logger.info("Extracting allCountries.txt...");
    await extractPostalFile(zipPath, extractedPath);
  } else if (isProvidedZip) {
    logger.info("Extracting allCountries.txt from provided zip...");
    await extractPostalFile(resolvedPostalFile, extractedPath);
  }

  if (!existsSync(postalFilePath)) {
    throw new Error(`Postal file not found at ${postalFilePath}`);
  }

  logger.info("Importing into database...");
  await importPostalData(databaseUrl, postalFilePath);

  if (shouldCleanup) {
    await rm(tempRoot, { recursive: true, force: true });
  }

  logger.info("Postal code centroid import complete.");
};

run().catch((error) => {
  logger.error({ error }, "Postal centroid import failed");
  process.exitCode = 1;
});