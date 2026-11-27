import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../../middleware/error.middleware.js";
import { parseSubmitJob, submitJob, type SubmitJobInput } from "./job.service.js";

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

function validationMessage(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const name = issue.path.map(String).join(".") || "body";
      return `${name}: ${issue.message}`;
    })
    .join("; ");
}
