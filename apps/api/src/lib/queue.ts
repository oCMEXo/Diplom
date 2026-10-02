import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { RUN_QUEUE_NAME } from "@collab/shared";
import type { RunJob } from "@collab/shared";
import { env } from "../env.js";

let connection: Redis | null = null;
let queue: Queue<RunJob> | null = null;

function getQueue() {
  if (!queue) {
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue<RunJob>(RUN_QUEUE_NAME, {
      connection,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: 100, attempts: 1 },
    });
  }
  return queue;
}

export async function enqueueRun(job: RunJob) {
  await getQueue().add("run", job, { jobId: job.runId });
}

export async function closeRunQueue() {
  await queue?.close();
  connection?.disconnect();
  queue = null;
  connection = null;
}
