import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../../middleware/error.middleware.js";
import {
  getJob,
  listJobAttempts,
  listJobs,
  parseJobId,
  parseListJobsQuery,
  parseSubmitJob,
  submitJob,
  retryFailedJob,
  type ListJobsQuery,
  type SubmitJobInput,
} from "./job.service.js";

export function postJob(req: Request, res: Response, next: NextFunction): void {
  let input: SubmitJobInput;

  try {
    input = parseSubmitJob(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      next(new HttpError(400, validationMessage(error)));
      return;
    }

    next(error);
    return;
  }

  submitJob(input)
    .then((job) => {
      res.status(202).json({
        success: true,
        message: "Job submitted successfully",
        data: {
          jobId: job.id,
          status: job.status.toLowerCase(),
        },
      });
    })
    .catch(next);
}

export function getJobs(req: Request, res: Response, next: NextFunction): void {
  let query: ListJobsQuery;

  try {
    query = parseListJobsQuery(req.query);
  } catch (error) {
    if (error instanceof ZodError) {
      next(new HttpError(400, validationMessage(error)));
      return;
    }

    next(error);
    return;
  }

  listJobs(query)
    .then((data) => {
      res.status(200).json({
        success: true,
        data,
      });
    })
    .catch(next);
}

export function getJobById(req: Request, res: Response, next: NextFunction): void {
  let id: string;

  try {
    id = parseJobId(firstParam(req.params.id));
  } catch (error) {
    if (error instanceof ZodError) {
      next(new HttpError(404, "Job not found"));
      return;
    }

    next(error);
    return;
  }

  getJob(id)
    .then((job) => {
      if (!job) {
        next(new HttpError(404, "Job not found"));
        return;
      }

      res.status(200).json({
        success: true,
        data: job,
      });
    })
    .catch(next);
}

export function getJobAttempts(req: Request, res: Response, next: NextFunction): void {
  let id: string;

  try {
    id = parseJobId(firstParam(req.params.id));
  } catch (error) {
    if (error instanceof ZodError) {
      next(new HttpError(404, "Job not found"));
      return;
    }

    next(error);
    return;
  }

  listJobAttempts(id)
    .then((attempts) => {
      if (!attempts) {
        next(new HttpError(404, "Job not found"));
        return;
      }

      res.status(200).json({
        success: true,
        data: attempts,
      });
    })
    .catch(next);
}

export function postJobRetry(req: Request, res: Response, next: NextFunction): void {
  let id: string;

  try {
    id = parseJobId(firstParam(req.params.id));
  } catch (error) {
    if (error instanceof ZodError) {
      next(new HttpError(404, "Job not found"));
      return;
    }

    next(error);
    return;
  }

  retryFailedJob(id)
    .then((result) => {
      if (result.outcome === "missing") {
        next(new HttpError(404, "Job not found"));
        return;
      }

      if (result.outcome === "conflict") {
        next(new HttpError(409, "Only failed jobs can be retried"));
        return;
      }

      res.status(202).json({
        success: true,
        message: "Job retry submitted",
        data: {
          jobId: result.id,
          status: result.status.toLowerCase(),
        },
      });
    })
    .catch(next);
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function validationMessage(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const name = issue.path.map(String).join(".") || "body";
      return `${name}: ${issue.message}`;
    })
    .join("; ");
}
