import { Redis } from "ioredis";
import { env } from "./env.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redis.on("error", (error: Error) => {
  console.error(`Redis connection error: ${error.message}`);
});

export async function disconnectRedis(): Promise<void> {
  if (redis.status === "end") {
    return;
  }

  await redis.quit();
}
