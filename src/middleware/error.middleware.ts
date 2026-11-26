import type { ErrorRequestHandler } from "express";
import { env } from "../config/env.js";

export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode = statusCodeOf(error);
  const message = error instanceof Error ? error.message : "Internal server error";

  if (env.NODE_ENV === "development" && error instanceof Error && error.stack) {
    res.status(statusCode).json({
      success: false,
      message,
      stack: error.stack,
    });
    return;
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
};

function statusCodeOf(error: unknown): number {
  if (typeof error !== "object" || error === null) {
    return 500;
  }

  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }

  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }

  return 500;
}
