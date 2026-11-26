# QueueFlow

Background job platform. The API, PostgreSQL, and Redis come up together. BullMQ uses that Redis connection for one queue, `queueflow-default`. Each job's name is its type, such as `SEND_EMAIL`.

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

## Submit a job

`POST /api/jobs` accepts `SEND_EMAIL` only. The response is HTTP 202 as soon as the job is stored and queued. Nothing runs the job yet.

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/jobs -ContentType "application/json" -Body '{"type":"SEND_EMAIL","payload":{"to":"test@example.com","subject":"Welcome","body":"Welcome to QueueFlow!"}}'
```

`options.attempts` is optional (default 3, maximum 5). Other option fields, including `priority`, are ignored until a later phase.
