import { app } from "./app";
import { logger } from "@uni-status/shared";

const port = parseInt(process.env.API_PORT || "3001");

logger.info({ port }, "Starting Uni-Status API server");

export default {
  port,
  fetch: app.fetch,
};
