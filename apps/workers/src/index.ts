import { createQueues } from "./queues";
import { createWorkers, loadEnterpriseWorkers } from "./workers";
import { scheduler } from "./scheduler";
import type { Worker } from "bullmq";
import { createLogger } from "@uni-status/shared";

const log = createLogger({ module: "workers-bootstrap" });

const queues = createQueues();
const workers = createWorkers(queues);

let enterpriseWorkers: Worker[] = [];

async function start() {
  enterpriseWorkers = await loadEnterpriseWorkers();
  scheduler.start();
}

start().catch((error) => {
  log.error({ err: error }, "Failed to start workers");
  process.exit(1);
});

const shutdown = async () => {
  scheduler.stop();

  await Promise.all([
    ...workers.map((worker) => worker.close()),
    ...enterpriseWorkers.map((worker) => worker.close()),
  ]);
  await Promise.all(Object.values(queues).map((queue) => queue.close()));

  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
