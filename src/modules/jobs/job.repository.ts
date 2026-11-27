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

export function markJobActive(id: string, attemptNumber: number) {
  const startedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.update({
      where: { id },
      data: {
        status: "ACTIVE",
        startedAt,
        attemptsMade: attemptNumber,
      },
    });

    await tx.jobAttempt.create({
      data: {
        jobId: id,
        attemptNumber,
        status: "ACTIVE",
        startedAt,
      },
    });

    return job;
  });
}

export function markJobCompleted(
  id: string,
  result: Prisma.InputJsonValue,
  attemptNumber: number,
) {
  const completedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.update({
      where: { id },
      data: {
        status: "COMPLETED",
        result,
        error: null,
        completedAt,
        attemptsMade: attemptNumber,
      },
    });

    await tx.jobAttempt.update({
      where: {
        jobId_attemptNumber: {
          jobId: id,
          attemptNumber,
        },
      },
      data: {
        status: "COMPLETED",
        error: null,
        completedAt,
      },
    });

    return job;
  });
}

export function markJobAttemptEnded(
  id: string,
  error: string,
  attemptNumber: number,
  terminal: boolean,
) {
  const completedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.update({
      where: { id },
      data: {
        status: terminal ? "FAILED" : "WAITING",
        error,
        attemptsMade: attemptNumber,
        ...(terminal ? { completedAt } : {}),
      },
    });

    await tx.jobAttempt.update({
      where: {
        jobId_attemptNumber: {
          jobId: id,
          attemptNumber,
        },
      },
      data: {
        status: "FAILED",
        error,
        completedAt,
      },
    });

    return job;
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

export function findJobForRetry(id: string) {
  return prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      payload: true,
      status: true,
      attemptsMade: true,
      maxAttempts: true,
    },
  });
}

export async function claimFailedJob(id: string) {
  const claimed = await prisma.job.updateMany({
    where: { id, status: "FAILED" },
    data: {
      status: "WAITING",
      error: null,
      result: Prisma.DbNull,
      completedAt: null,
    },
  });

  return claimed.count === 1;
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

const jobAttemptSelect = {
  id: true,
  attemptNumber: true,
  status: true,
  error: true,
  startedAt: true,
  completedAt: true,
} satisfies Prisma.JobAttemptSelect;

export function findJobAttempts(jobId: string) {
  return prisma.jobAttempt.findMany({
    where: { jobId },
    orderBy: { attemptNumber: "asc" },
    select: jobAttemptSelect,
  });
}

export function findJobId(id: string) {
  return prisma.job.findUnique({
    where: { id },
    select: { id: true },
  });
}
