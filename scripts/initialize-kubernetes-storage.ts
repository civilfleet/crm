import { spawn } from "node:child_process";
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import s3 from "@/lib/s3-client";

async function main() {
  // This command is for the new target only; it must not inherit the VM's
  // storage endpoint or silently operate on the checkout's development bucket.
  if (process.env.NEXT_AWS_S3_ENDPOINT !== "http://crm-storage:8333") {
    throw new Error(
      "Storage bootstrap requires the explicit Kubernetes target endpoint.",
    );
  }
  const bucket = process.env.NEXT_AWS_S3_BUCKET_NAME;
  if (!bucket || !process.env.S3_CORS_ALLOWED_ORIGINS)
    throw new Error("Bucket and CORS origins are required.");
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("$metadata" in error) ||
      (error.$metadata as { httpStatusCode?: number }).httpStatusCode !== 404
    )
      throw error;
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  await new Promise<void>((done, fail) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/manage-s3-cors.ts", "apply"],
      { stdio: "inherit", env: process.env },
    );
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0 ? done() : fail(new Error("CORS configuration failed.")),
    );
  });
}
main().catch(() => {
  console.error(
    "Kubernetes storage bootstrap failed; verify target configuration and storage health.",
  );
  process.exitCode = 1;
});
