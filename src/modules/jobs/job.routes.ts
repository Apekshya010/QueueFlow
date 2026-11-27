import { Router } from "express";
import { postJob } from "./job.controller.js";

export const jobRouter = Router();

jobRouter.post("/", postJob);
