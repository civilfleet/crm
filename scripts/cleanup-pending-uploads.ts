import "dotenv/config";
import logger from "@/lib/logger";
import { cleanupExpiredPendingUploads } from "@/services/file/pending-uploads";

const parseLimit = () => {
  const rawLimit = process.argv[2] ?? process.env.PENDING_UPLOAD_CLEANUP_LIMIT;
  if (!rawLimit) {
    return undefined;
  }

  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Cleanup limit must be a positive integer");
  }

  return limit;
};

const run = async () => {
  const result = await cleanupExpiredPendingUploads({
    limit: parseLimit(),
  });

  logger.info(result, "Pending upload cleanup finished");
};

run().catch((error) => {
  logger.error({ error }, "Pending upload cleanup failed");
  process.exit(1);
});
