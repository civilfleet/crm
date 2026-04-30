import "dotenv/config";
import logger from "@/lib/logger";
import { runZammadWorker } from "@/services/integrations/zammad-worker";

runZammadWorker().catch((error) => {
  logger.fatal({ error }, "[ZammadWorker] Fatal error");
  process.exit(1);
});
