import { Router } from "express";
import { getJobAttempts, getJobById, getJobs, postJob } from "./job.controller.js";

export const jobRouter = Router();

jobRouter.get("/", getJobs);
jobRouter.get("/:id/attempts", getJobAttempts);
jobRouter.get("/:id", getJobById);
jobRouter.post("/", postJob);
