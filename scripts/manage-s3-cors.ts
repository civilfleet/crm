import fs from "node:fs";
import path from "node:path";
import {
  type CORSRule,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";

type Mode = "apply" | "check" | "print";

const loadDotenv = () => {
  const cwd = process.cwd();
  const nodeEnv = process.env.NODE_ENV;
  const candidates = [
    ".env.local",
    ".env",
    nodeEnv ? `.env.${nodeEnv}` : null,
    nodeEnv ? `.env.${nodeEnv}.local` : null,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const filePath = path.join(cwd, candidate);
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: false });
    }
  }
};

loadDotenv();

const parseList = (value: string | undefined, fallback: string[]) => {
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const requiredEnv = (name: string, fallbackName?: string): string => {
  const value =
    process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value || value.trim() === "") {
    const alias = fallbackName ? ` (or ${fallbackName})` : "";
    throw new Error(`Missing required environment variable: ${name}${alias}`);
  }
  return value;
};

const bucket = requiredEnv("NEXT_AWS_S3_BUCKET_NAME", "AWS_BUCKET_NAME");
const region = requiredEnv("NEXT_AWS_S3_BUCKET_REGION", "AWS_REGION");
const rawEndpoint = requiredEnv("NEXT_AWS_S3_ENDPOINT", "AWS_S3_ENDPOINT");
const accessKeyId = requiredEnv("NEXT_AWS_S3_ACCESS_KEY", "AWS_ACCESS_KEY_ID");
const secretAccessKey = requiredEnv(
  "NEXT_AWS_S3_ACCESS_SECRET",
  "AWS_SECRET_ACCESS_KEY",
);

const mode = (process.argv[2] ?? "check") as Mode;
if (!["apply", "check", "print"].includes(mode)) {
  console.error("Usage: tsx scripts/manage-s3-cors.ts [apply|check|print]");
  process.exit(1);
}

const normalizedEndpoint = (() => {
  const url = new URL(rawEndpoint);
  const path = url.pathname.replace(/^\/+|\/+$/g, "");
  if (path === bucket) {
    url.pathname = "/";
  }
  return url.toString();
})();

const forcePathStyleFromEnv = process.env.S3_FORCE_PATH_STYLE;
const forcePathStylePreferred =
  forcePathStyleFromEnv !== undefined
    ? forcePathStyleFromEnv === "true"
    : !new URL(normalizedEndpoint).hostname.startsWith(`${bucket}.`);

const createS3Client = (forcePathStyle: boolean) =>
  new S3({
    region,
    endpoint: normalizedEndpoint,
    forcePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

const desiredRules: CORSRule[] = [
  {
    AllowedOrigins: parseList(process.env.S3_CORS_ALLOWED_ORIGINS, [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]),
    AllowedMethods: parseList(process.env.S3_CORS_ALLOWED_METHODS, [
      "GET",
      "HEAD",
      "PUT",
    ]),
    AllowedHeaders: parseList(process.env.S3_CORS_ALLOWED_HEADERS, ["*"]),
    ExposeHeaders: parseList(process.env.S3_CORS_EXPOSE_HEADERS, ["ETag"]),
    MaxAgeSeconds: Number(process.env.S3_CORS_MAX_AGE_SECONDS ?? 3000),
  },
];

const normalizeRules = (rules: CORSRule[] | undefined) => {
  return (rules ?? []).map((rule) => ({
    AllowedOrigins: [...(rule.AllowedOrigins ?? [])].sort(),
    AllowedMethods: [...(rule.AllowedMethods ?? [])].sort(),
    AllowedHeaders: [...(rule.AllowedHeaders ?? [])].sort(),
    ExposeHeaders: [...(rule.ExposeHeaders ?? [])].sort(),
    MaxAgeSeconds: rule.MaxAgeSeconds ?? 0,
  }));
};

const getCurrentRules = async (s3: S3) => {
  try {
    const response = await s3.send(
      new GetBucketCorsCommand({ Bucket: bucket }),
    );
    return response.CORSRules ?? [];
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "Code" in error
        ? String((error as { Code?: string }).Code)
        : "";
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("NoSuchCORSConfiguration")) {
      return [];
    }
    if (code === "NoSuchCORSConfiguration") {
      return [];
    }
    throw error;
  }
};

const printRules = (label: string, rules: CORSRule[]) => {
  console.log(`${label}:`);
  console.log(JSON.stringify(rules, null, 2));
};

const run = async () => {
  if (mode === "print") {
    printRules("Desired CORS rules", desiredRules);
    console.log(`Endpoint: ${normalizedEndpoint}`);
    console.log(`Bucket: ${bucket}`);
    console.log(`Preferred forcePathStyle: ${String(forcePathStylePreferred)}`);
    return;
  }

  const stylesToTry = [forcePathStylePreferred, !forcePathStylePreferred];
  let s3: S3 | null = null;
  let currentRules: CORSRule[] | null = null;
  let lastError: unknown = null;

  for (const forcePathStyle of stylesToTry) {
    const client = createS3Client(forcePathStyle);
    try {
      const rules = await getCurrentRules(client);
      s3 = client;
      currentRules = rules;
      if (forcePathStyle !== forcePathStylePreferred) {
        console.warn(
          `Retried with forcePathStyle=${String(forcePathStyle)} and succeeded.`,
        );
      }
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!s3 || !currentRules) {
    throw lastError;
  }

  const currentNormalized = normalizeRules(currentRules);
  const desiredNormalized = normalizeRules(desiredRules);

  const matches =
    JSON.stringify(currentNormalized) === JSON.stringify(desiredNormalized);

  if (mode === "check") {
    if (!matches) {
      printRules("Current bucket CORS", currentRules);
      printRules("Desired bucket CORS", desiredRules);
      console.error("\nS3 CORS configuration does not match desired rules.");
      process.exit(2);
    }
    console.log("S3 CORS configuration matches desired rules.");
    return;
  }

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: desiredRules,
      },
    }),
  );

  console.log("Applied S3 CORS configuration successfully.");
  printRules("Applied bucket CORS", desiredRules);
};

run().catch((error) => {
  console.error("Failed to manage S3 CORS configuration.");
  console.error(error);
  process.exit(1);
});