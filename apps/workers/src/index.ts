import { createQueues } from "./queues";
import { createWorkers, loadEnterpriseWorkers } from "./workers";
import { scheduler } from "./scheduler";
import type { Worker } from "bullmq";

const queues = createQueues();
const workers = createWorkers(queues);

let enterpriseWorkers: Worker[] = [];
loadEnterpriseWorkers().then((ew) => {
  enterpriseWorkers = ew;
});

scheduler.start();

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
