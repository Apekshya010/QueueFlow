import type { DefaultJobOptions } from "bullmq";

export const QUEUE_NAME = "queueflow-default";

// Delay before retry n is 2^(n-1) seconds: 1s, then 2s, then 4s.
export const RETRY_BACKOFF_MS = 1000;

export const defaultJobOptions = {
  removeOnComplete: false,
  removeOnFail: false,
  backoff: {
    type: "exponential",
    delay: RETRY_BACKOFF_MS,
  },
} satisfies DefaultJobOptions;

export type QueueJobData = {
  type: string;
  payload: unknown;
  jobId: string;
  attemptOffset: number;
};
