import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { JobStatus } from "../../generated/prisma/client.js";
import { addJob } from "../../queue/queue.factory.js";
import {
  claimFailedJob,
  createJob,
  findJobAttempts,
  findJobById,
  findJobForRetry,
  findJobId,
  findJobs,
  markJobFailed,
  setBullJobId,
} from "./job.repository.js";

export class EnqueueFailedError extends Error {
  readonly statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = "EnqueueFailedError";
  }
}

const submitJobSchema = z.object({
  type: z.literal("SEND_EMAIL"),
  payload: z.record(z.string(), z.json()),
  options: z
    .object({
      attempts: z.number().int().min(1).max(5).default(3),
    })
    .default({ attempts: 3 }),
});

export type SubmitJobInput = z.infer<typeof submitJobSchema>;

const publicStatusSchema = z.enum(["waiting", "active", "completed", "failed"]);

const listJobsQuerySchema = z.object({
  status: z.string().trim().toLowerCase().pipe(publicStatusSchema).optional(),
  type: z.string().trim().min(1).max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const jobIdSchema = z.uuid();

const publicToDbStatus = {
  waiting: "WAITING",
  active: "ACTIVE",
  completed: "COMPLETED",
  failed: "FAILED",
} as const satisfies Record<z.infer<typeof publicStatusSchema>, JobStatus>;

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

export type RetryJobResult =
  | { outcome: "missing" }
  | { outcome: "conflict" }
  | { outcome: "queued"; id: string; status: JobStatus };

export function parseSubmitJob(body: unknown): SubmitJobInput {
  return submitJobSchema.parse(body);
}

export function parseListJobsQuery(query: unknown): ListJobsQuery {
  return listJobsQuerySchema.parse(query);
}

export function parseJobId(id: unknown): string {
  return jobIdSchema.parse(id);
}

export async function submitJob(input: SubmitJobInput) {
  const job = await createJob({
    type: input.type,
    payload: input.payload,
    maxAttempts: input.options.attempts,
  });

  try {
    await addJob(
      job.type,
      {
        type: job.type,
        payload: input.payload,
        jobId: job.id,
        attemptOffset: 0,
      },
      {
        jobId: job.id,
        attempts: job.maxAttempts,
      },
    );
  } catch (error) {
    const message = errorText(error);
    await markJobFailed(job.id, message);
    throw new EnqueueFailedError(message);
  }

  return setBullJobId(job.id, job.id);
}

export async function retryFailedJob(id: string): Promise<RetryJobResult> {
  const job = await findJobForRetry(id);

  if (!job) {
    return { outcome: "missing" };
  }

  if (job.status !== "FAILED") {
    return { outcome: "conflict" };
  }

  const claimed = await claimFailedJob(id);

  if (!claimed) {
    const current = await findJobForRetry(id);
    return current ? { outcome: "conflict" } : { outcome: "missing" };
  }

  const bullJobId = randomUUID();

  try {
    await addJob(
      job.type,
      {
        type: job.type,
        payload: job.payload,
        jobId: job.id,
        attemptOffset: job.attemptsMade,
      },
      {
        jobId: bullJobId,
        attempts: job.maxAttempts,
      },
    );
  } catch (error) {
    const message = errorText(error);
    await markJobFailed(job.id, message);
    throw new EnqueueFailedError(message);
  }

  const queued = await setBullJobId(job.id, bullJobId);

  return { outcome: "queued", id: queued.id, status: queued.status };
}

export async function listJobs(query: ListJobsQuery) {
  const { items, total } = await findJobs({
    ...(query.status ? { status: publicToDbStatus[query.status] } : {}),
    ...(query.type ? { type: query.type } : {}),
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return {
    items: items.map(toListItem),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getJob(id: string) {
  const job = await findJobById(id);

  if (!job) {
    return null;
  }

  return toJobDetail(job);
}

export async function listJobAttempts(id: string) {
  const job = await findJobId(id);

  if (!job) {
    return null;
  }

  const attempts = await findJobAttempts(id);

  return attempts.map((attempt) => ({
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status.toLowerCase(),
    error: attempt.error,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
  }));
}

function toListItem(job: {
  id: string;
  type: string;
  status: JobStatus;
  attemptsMade: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}) {
  return {
    id: job.id,
    type: job.type,
    status: job.status.toLowerCase(),
    attemptsMade: job.attemptsMade,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

function toJobDetail(job: {
  id: string;
  type: string;
  status: JobStatus;
  attemptsMade: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  payload: unknown;
  result: unknown;
  error: string | null;
  priority: number;
}) {
  return {
    ...toListItem(job),
    payload: job.payload,
    result: job.result,
    error: job.error,
    priority: job.priority,
  };
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Failed to enqueue job";
}
