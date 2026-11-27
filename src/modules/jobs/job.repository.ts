import { prisma } from "../../config/database.js";
import { Prisma, type JobStatus } from "../../generated/prisma/client.js";

const jobListSelect = {
  id: true,
  type: true,
  status: true,
  attemptsMade: true,
  maxAttempts: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
} satisfies Prisma.JobSelect;

const jobDetailSelect = {
  ...jobListSelect,
  payload: true,
  result: true,
  error: true,
  priority: true,
} satisfies Prisma.JobSelect;

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

export function markJobActive(id: string, attemptsMade: number) {
  return prisma.job.update({
    where: { id },
    data: {
      status: "ACTIVE",
      startedAt: new Date(),
      attemptsMade,
    },
  });
}

export function markJobCompleted(
  id: string,
  result: Prisma.InputJsonValue,
  attemptsMade: number,
) {
  return prisma.job.update({
    where: { id },
    data: {
      status: "COMPLETED",
      result,
      error: null,
      completedAt: new Date(),
      attemptsMade,
    },
  });
}

export function markJobAttemptEnded(
  id: string,
  error: string,
  attemptsMade: number,
  terminal: boolean,
) {
  return prisma.job.update({
    where: { id },
    data: {
      status: terminal ? "FAILED" : "WAITING",
      error,
      attemptsMade,
      ...(terminal ? { completedAt: new Date() } : {}),
    },
  });
}

export function isMissingJob(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function setBullJobId(id: string, bullJobId: string) {
  return prisma.job.update({
    where: { id },
    data: { bullJobId },
  });
}

export async function findJobs(input: {
  status?: JobStatus;
  type?: string;
  skip: number;
  take: number;
}) {
  const where: Prisma.JobWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: input.skip,
      take: input.take,
      select: jobListSelect,
    }),
    prisma.job.count({ where }),
  ]);

  return { items, total };
}

export function findJobById(id: string) {
  return prisma.job.findUnique({
    where: { id },
    select: jobDetailSelect,
  });
}
