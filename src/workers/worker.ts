import { UnrecoverableError, Worker, type Job } from "bullmq";
import { disconnectDatabase } from "../config/database.js";
import { disconnectRedis, redis } from "../config/redis.js";
import {
  isMissingJob,
  markJobActive,
  markJobAttemptEnded,
  markJobCompleted,
} from "../modules/jobs/job.repository.js";
import type { Prisma } from "../generated/prisma/client.js";
import { processors } from "../processors/index.js";
import { QUEUE_NAME } from "../queue/queue.constants.js";

type QueueJobData = {
  type: string;
  payload: unknown;
};

const worker = new Worker<QueueJobData, Prisma.InputJsonObject>(
  QUEUE_NAME,
  processJob,
  {
    connection: redis,
    concurrency: 1,
  },
);

async function processJob(job: Job<QueueJobData>): Promise<Prisma.InputJsonObject> {
  const id = job.id;

  if (!id) {
    throw new UnrecoverableError("Job is missing an id");
  }

  try {
    await markJobActive(id, job.attemptsMade);
  } catch (error) {
    if (isMissingJob(error)) {
      console.error(`Job ${id} was not found in PostgreSQL`);
      throw new UnrecoverableError(`Job ${id} was not found in PostgreSQL`);
    }

    throw error;
  }

  console.log(`Job ${id} active`);

  const processor = processors[job.data.type];

  if (!processor) {
    throw new Error("Unsupported job type");
  }

  return processor(job.data.payload, id);
}

worker.on("completed", (job, result) => {
  const id = job.id;

  if (!id) {
    console.error("Completed job is missing an id");
    return;
  }

  markJobCompleted(id, result, job.attemptsMade)
    .then(() => {
      console.log(`Job ${id} completed`);
    })
    .catch((error: unknown) => {
      reportUpdateError(id, error);
    });
});

worker.on("failed", (job, error) => {
  const id = job?.id;

  if (!id) {
    console.error("Failed job is missing an id");
    return;
  }

  const maxAttempts = job.opts.attempts ?? 1;
  const terminal = job.attemptsMade >= maxAttempts;

  markJobAttemptEnded(id, error.message, job.attemptsMade, terminal)
    .then(() => {
      console.log(`Job ${id} ${terminal ? "failed" : "waiting"}`);
    })
    .catch((updateError: unknown) => {
      reportUpdateError(id, updateError);
    });
});

worker.on("error", (error: Error) => {
  console.error(`Worker error: ${error.message}`);
});

worker.on("ready", () => {
  console.log(`QueueFlow worker listening on queue ${QUEUE_NAME}`);
});

function reportUpdateError(id: string, error: unknown): void {
  if (isMissingJob(error)) {
    console.error(`Job ${id} was not found in PostgreSQL`);
    return;
  }

  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`Job ${id} status update failed: ${message}`);
}

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await worker.close();
  await disconnectDatabase();
  await disconnectRedis();
}

process.once("SIGINT", () => {
  shutdown()
    .then(() => {
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
});

process.once("SIGTERM", () => {
  shutdown()
    .then(() => {
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
});
