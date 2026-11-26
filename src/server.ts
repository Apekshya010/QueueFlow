import { createApp } from "./app.js";
import { disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { disconnectRedis } from "./config/redis.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`QueueFlow API listening on port ${env.PORT}`);
});

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  await disconnectDatabase();
  await disconnectRedis();
}

process.once("SIGINT", () => {
  shutdown()
    .then(() => {
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
});
