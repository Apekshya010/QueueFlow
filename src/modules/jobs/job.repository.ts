import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";

export function createJob(input: {
  type: string;
  payload: Prisma.InputJsonObject;
  maxAttempts: number;
}) {
  return prisma.job.create({
    data: {
      type: input.type,
      payload: input.payload,
      maxAttempts: input.maxAttempts,
      status: "WAITING",
    },
  });
}

export function markJobFailed(id: string, error: string) {
  return prisma.job.update({
    where: { id },
    data: {
      status: "FAILED",
      error,
    },
  });
}

export function setBullJobId(id: string, bullJobId: string) {
  return prisma.job.update({
    where: { id },
    data: { bullJobId },
  });
}
