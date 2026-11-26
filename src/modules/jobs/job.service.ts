import { z } from "zod";
import { addJob } from "../../queue/queue.factory.js";
import { createJob } from "./job.repository.js";

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

  return job;
}
