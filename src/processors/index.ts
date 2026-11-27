import type { Prisma } from "../generated/prisma/client.js";
import { sendEmailProcessor } from "./email.processor.js";

export type JobProcessor = (
  payload: unknown,
  jobId: string,
) => Promise<Prisma.InputJsonObject>;

export const processors: Record<string, JobProcessor> = {
  SEND_EMAIL: sendEmailProcessor,
};
