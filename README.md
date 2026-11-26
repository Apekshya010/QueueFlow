# QueueFlow

Background job platform. The API, PostgreSQL, and Redis come up together. BullMQ uses that Redis connection for one queue, `queueflow-default`. A job's queue name is its type string. HTTP submission is not wired up yet.

## Requirements

- Node.js 22
- Docker Desktop, with the engine running

## Run locally

From the project root:

```powershell
Copy-Item .env.example .env
docker compose up -d
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

`npx prisma generate` is required because the Prisma Client is not committed. `migrate dev` applies the tables in PostgreSQL.

## Check

With the API running:

```powershell
curl.exe http://127.0.0.1:3000/health
```

Phase 1 is done when the response is HTTP 200 and both dependencies are up:

```json
{"success":true,"data":{"status":"ok","database":"up","redis":"up"}}
```

The API listens on port 3000. PostgreSQL is on port 5432 and Redis is on port 6379, both from Docker Compose.
