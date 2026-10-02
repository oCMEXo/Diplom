import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { RUN_EVENTS_CHANNEL, RUN_QUEUE_NAME } from "@collab/shared";
import type { RunEvent } from "@collab/shared";
import { env } from "./env.js";
import { processRunJob } from "./worker.js";

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const publisher = new Redis(env.REDIS_URL);

const publish = (event: RunEvent) => publisher.publish(RUN_EVENTS_CHANNEL, JSON.stringify(event));

const worker = new Worker(RUN_QUEUE_NAME, (job) => processRunJob(job.data, publish), {
  connection,
  concurrency: env.RUNNER_CONCURRENCY,
});

worker.on("failed", (job, error) => {
  console.error(`run ${job?.id ?? "?"} failed:`, error.message);
});

console.log(`runner listening on queue "${RUN_QUEUE_NAME}" (concurrency ${env.RUNNER_CONCURRENCY})`);

async function shutdown() {
  await worker.close();
  await publisher.quit();
  await connection.quit();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
