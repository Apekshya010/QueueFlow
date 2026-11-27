import { Router } from "express";
import { getJobAttempts, getJobById, getJobs, postJob, postJobRetry } from "./job.controller.js";

export const jobRouter = Router();

jobRouter.get("/", getJobs);
jobRouter.get("/:id/attempts", getJobAttempts);
jobRouter.post("/:id/retry", postJobRetry);
jobRouter.get("/:id", getJobById);
jobRouter.post("/", postJob);
