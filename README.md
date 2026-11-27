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

`options.attempts` is optional (default 3, maximum 5). A failed attempt is retried by BullMQ with exponential backoff: 1 second, then 2 seconds, then 4 seconds. The job row returns to `waiting` while retries remain, and the latest error stays on the row. When the last attempt fails, the row becomes `failed`. The API does not enqueue the retry itself. Other option fields, including `priority`, are ignored until a later phase.

`payload.failOnce: true` is a dev hook for `SEND_EMAIL`. The first attempt in the current worker process throws `Simulated first-attempt failure`. The next attempt sends the email, so `to`, `subject`, and `body` still have to be present. Restarting the worker clears that memory.

## Test in Postman

Import `postman/QueueFlow.postman_collection.json` with Postman's Import button. `GET /api/jobs` lists jobs newest first. `GET /api/jobs/:id` returns one job, including its payload and result. After each send, the `jobId` in the 202 response is the id those routes use.

1. With `npm run dev` and `npm run worker` both running, send **Submit welcome email**. The response is HTTP 202 and `status` is `waiting` immediately. Refresh the row. It becomes `COMPLETED`, `attempts_made` is 1, `result` is `{ "message": "Email sent successfully" }`, and both `started_at` and `completed_at` are filled.
2. Stop the worker terminal with Ctrl+C. Send **Submit welcome email** again. Wait a few seconds and refresh Prisma Studio. That new row stays `WAITING`.
3. Run `npm run worker` again. Refresh the same row. The worker picks it up and it becomes `COMPLETED`.
4. With the worker running, send **Submit email missing to**. The API still returns 202. The row then becomes `FAILED` with error `Missing required field: to`. `attempts` is 1 in that request, so it does not retry.

## List and fetch jobs

`GET /api/jobs` returns `{ items, page, pageSize, total }`. Items are newest first and omit `payload` and `result`. Each item has `id`, `type`, `status`, `attemptsMade`, `maxAttempts`, `createdAt`, `startedAt`, and `completedAt`.

Optional query params: `status` (`waiting`, `active`, `completed`, `failed`), `type`, `page` (default 1), and `pageSize` (default 20, maximum 100). An invalid query is HTTP 400.

`GET /api/jobs/:id` returns the same fields plus `payload`, `result`, `error`, and `priority`. An unknown or malformed id is HTTP 404.

`GET /api/jobs/:id/attempts` returns that job's execution attempts in order. Each attempt has `id`, `attemptNumber`, `status`, `error`, `startedAt`, and `completedAt`. A job that has not started returns an empty list. An unknown id is HTTP 404.

`POST /api/jobs/:id/retry` queues a failed job again. The response is HTTP 202 and the row returns to `waiting`. Earlier attempt rows stay in place, and the next run continues the attempt numbers. Waiting, active, and completed jobs return HTTP 409. An unknown id is HTTP 404. The new queue job gets a new BullMQ id and the original `maxAttempts`.

```powershell
curl.exe "http://127.0.0.1:3000/api/jobs?status=completed&page=1&pageSize=20"
curl.exe http://127.0.0.1:3000/api/jobs/<jobId>
curl.exe http://127.0.0.1:3000/api/jobs/<jobId>/attempts
curl.exe -X POST http://127.0.0.1:3000/api/jobs/<jobId>/retry
```
