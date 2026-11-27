import { Queue, type Job } from "bullmq";
import { redis } from "../config/redis.js";
import { defaultJobOptions, QUEUE_NAME } from "./queue.constants.js";

const REDIS_PING_TIMEOUT_MS = 1000;
const ENQUEUE_TIMEOUT_MS = 2000;

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

export async function addJob<T extends Record<string, unknown>>(
  type: string,
  data: T,
  options: {
    jobId: string;
    attempts: number;
  },
): Promise<Job<T>> {
  await assertRedisReady();

  return withTimeout(
    getQueue().add(type, data, {
      jobId: options.jobId,
      attempts: options.attempts,
    }),
    ENQUEUE_TIMEOUT_MS,
    "Timed out while enqueueing job",
  );
}

async function assertRedisReady(): Promise<void> {
  const reply = await withTimeout(
    redis.ping(),
    REDIS_PING_TIMEOUT_MS,
    "Redis is unavailable",
  );

  if (reply !== "PONG") {
    throw new Error("Redis is unavailable");
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function closeQueue(): Promise<void> {
  if (!queue) {
    return;
  }

  const current = queue;
  queue = undefined;
  await current.close();
}
