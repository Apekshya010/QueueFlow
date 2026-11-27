import { z } from "zod";
import { addJob } from "../../queue/queue.factory.js";
import { createJob, markJobFailed, setBullJobId } from "./job.repository.js";

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

export function parseSubmitJob(body: unknown): SubmitJobInput {
  return submitJobSchema.parse(body);
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

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Failed to enqueue job";
}
