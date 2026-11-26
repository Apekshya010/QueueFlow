import express from "express";
import { prisma } from "./config/database.js";
import { redis } from "./config/redis.js";
import { errorMiddleware, HttpError } from "./middleware/error.middleware.js";

const HEALTH_TIMEOUT_MS = 2000;

type DependencyStatus = "up" | "down";

export function createApp(): express.Express {
  const app = express();

  app.use(express.json());

  app.get("/health", async (_req, res) => {
    const [database, redisStatus] = await Promise.all([
      pingDatabase(),
      pingRedis(),
    ]);
    const healthy = database === "up" && redisStatus === "up";

    res.status(healthy ? 200 : 503).json({
      success: healthy,
      data: {
        status: healthy ? "ok" : "error",
        database,
        redis: redisStatus,
      },
    });
  });

  app.use((_req, _res, next) => {
    next(new HttpError(404, "Not found"));
  });

  app.use(errorMiddleware);

  return app;
}

async function pingDatabase(): Promise<DependencyStatus> {
  try {
    await withTimeout(prisma.$queryRawUnsafe("SELECT 1"), HEALTH_TIMEOUT_MS);
    return "up";
  } catch {
    return "down";
  }
}

async function pingRedis(): Promise<DependencyStatus> {
  try {
    const reply = await withTimeout(redis.ping(), HEALTH_TIMEOUT_MS);
    return reply === "PONG" ? "up" : "down";
  } catch {
    return "down";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Health check timed out"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
