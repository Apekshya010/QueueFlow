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

In a second terminal, start the worker. It picks up queued jobs and writes their status back to PostgreSQL.

```powershell
npm run worker
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

`POST /api/jobs` accepts `SEND_EMAIL` only. The response is HTTP 202 as soon as the job is stored and queued. The worker, running separately, then marks that row active and, when the task finishes, completed. The queue job id is saved on the row as `bull_job_id`. If Redis cannot accept the job, that row is marked `FAILED` and the API returns HTTP 503.

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/jobs -ContentType "application/json" -Body '{"type":"SEND_EMAIL","payload":{"to":"test@example.com","subject":"Welcome","body":"Welcome to QueueFlow!"}}'
```

`options.attempts` is optional (default 3, maximum 5). Other option fields, including `priority`, are ignored until a later phase.

## Test in Postman

Import `postman/QueueFlow.postman_collection.json` with Postman's Import button. There is no `GET /api/jobs` yet. After each send, open Prisma Studio at [http://localhost:5555](http://localhost:5555) and find the `jobId` from the response in the `jobs` table.

1. With `npm run dev` and `npm run worker` both running, send **Submit welcome email**. The response is HTTP 202 and `status` is `waiting` immediately. Refresh the row. It becomes `COMPLETED`, `attempts_made` is 1, `result` is `{ "message": "Email sent successfully" }`, and both `started_at` and `completed_at` are filled.
2. Stop the worker terminal with Ctrl+C. Send **Submit welcome email** again. Wait a few seconds and refresh Prisma Studio. That new row stays `WAITING`.
3. Run `npm run worker` again. Refresh the same row. The worker picks it up and it becomes `COMPLETED`.
4. With the worker running, send **Submit email missing to**. The API still returns 202. The row then becomes `FAILED` with error `Missing required field: to`. `attempts` is 1 in that request, so it does not retry.
