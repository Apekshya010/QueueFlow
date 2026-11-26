import type { DefaultJobOptions } from "bullmq";

export const QUEUE_NAME = "queueflow-default";

export const defaultJobOptions = {
  removeOnComplete: false,
  removeOnFail: false,
} satisfies DefaultJobOptions;
