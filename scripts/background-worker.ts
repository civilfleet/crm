import "dotenv/config";
import logger from "@/lib/logger";
import { runBackgroundWorker } from "@/services/background-worker";

runBackgroundWorker().catch((error) => {
  logger.fatal({ error }, "[BackgroundWorker] Fatal error");
  process.exit(1);
});
