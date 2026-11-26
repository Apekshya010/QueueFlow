import { Queue, type Job } from "bullmq";
import { redis } from "../config/redis.js";
import { defaultJobOptions, QUEUE_NAME } from "./queue.constants.js";

let queue: Queue | undefined;

export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions,
    });

    queue.on("error", (error: Error) => {
      console.error(`Queue ${QUEUE_NAME} error: ${error.message}`);
    });
  }

  return queue;
}

export function addJob<T extends Record<string, unknown>>(
  type: string,
  data: T,
): Promise<Job<T>> {
  return getQueue().add(type, data);
}

export async function closeQueue(): Promise<void> {
  if (!queue) {
    return;
  }

  const current = queue;
  queue = undefined;
  await current.close();
}
