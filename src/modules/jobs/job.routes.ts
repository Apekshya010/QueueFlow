import { Router } from "express";
import { getJobById, getJobs, postJob } from "./job.controller.js";

export const jobRouter = Router();

jobRouter.get("/", getJobs);
jobRouter.get("/:id", getJobById);
jobRouter.post("/", postJob);
