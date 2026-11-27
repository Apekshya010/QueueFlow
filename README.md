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

## Response contract

Submit and retry return `202` with `{ success, message, data: { jobId, status: "waiting" } }`. That status is the state the API assigned when it accepted the job. A later GET shows `active`, `completed`, or `failed` after the worker moves the row.

Reads return `200` with `{ success, data }`. A job's `id` in a read is the same value as `jobId` from submit. List data is `{ items, page, pageSize, total }`. An empty list is `items: []` with `total: 0`. Detail adds `payload`, `result`, `error`, and `priority`. Attempts are an array ordered by `attemptNumber`.

Errors return `{ success: false, message }`. In development the body also includes `stack`. Unknown and malformed ids are `404`. A query or body Zod rejects is `400`. Retry of a job that is not `failed` is `409`.

There is no cancel endpoint in this phase. While BullMQ is waiting out a backoff, PostgreSQL status is `waiting`.

## Phase 3 milestone in Postman

Import `postman/QueueFlow.postman_collection.json`. If an older copy is already imported, import this file again and replace it. `npm run dev` and `npm run worker` both have to be running. Leave the worker running through folder 3. Restarting it clears the `failOnce` memory, and the manual retry then fails again.

Open the collection and choose **Run**. Run all four folders in order. Requests that need the worker to finish wait before they send. The Tests tab of each request shows pass or fail.

You can also send the requests yourself from top to bottom. Wait about 1 second after the welcome email, about 6 seconds after the missing-`to` email, and about 1 second after the fail-once email and after its retry. If a check still shows `waiting`, send that request again.

1. **Happy path.** Submit returns `202` and `waiting`. The detail then shows `completed`, `attemptsMade` 1, and `result.message` `Email sent successfully`. The completed filter lists that job and omits `payload` and `result`. Attempts has one completed row.
2. **Exhausted retries.** The missing-`to` job uses 3 attempts. It returns to `waiting` between them, then ends `failed` with `attemptsMade` 3. The error contains `Missing required field: to`. Attempts are rows 1, 2, and 3, all `failed`.
3. **Manual retry.** `failOnce` with `attempts` 1 ends `failed`. Retry returns `202` and `waiting`, then the same job becomes `completed` with `attemptsMade` 2. Attempt 1 stays `failed` and attempt 2 is `completed`. Retrying that completed job returns `409`.
4. **Rejections.** A bad `status` query and an unknown job type return `400`. An unknown id returns `404`.

## List and fetch jobs

`GET /api/jobs` returns `{ items, page, pageSize, total }`. Items are newest first and omit `payload` and `result`. Each item has `id`, `type`, `status`, `attemptsMade`, `maxAttempts`, `createdAt`, `startedAt`, and `completedAt`.

Optional query params: `status` (`waiting`, `active`, `completed`, `failed`), `type`, `page` (default 1), and `pageSize` (default 20, maximum 100). An invalid query is HTTP 400.

`GET /api/jobs/:id` returns the same fields plus `payload`, `result`, `error`, and `priority`. `result` is the processor's JSON object, stored unchanged. `error` is empty when the job succeeded. When it failed, `error` is the message, and in development it also includes the stack, truncated to 4000 characters. The same text is stored on that attempt. An unknown or malformed id is HTTP 404.

`GET /api/jobs/:id/attempts` returns that job's execution attempts in order. Each attempt has `id`, `attemptNumber`, `status`, `error`, `startedAt`, and `completedAt`. A job that has not started returns an empty list. An unknown id is HTTP 404.

`POST /api/jobs/:id/retry` queues a failed job again. The response is HTTP 202 and the row returns to `waiting`. Earlier attempt rows stay in place, and the next run continues the attempt numbers. Waiting, active, and completed jobs return HTTP 409. An unknown id is HTTP 404. The new queue job gets a new BullMQ id and the original `maxAttempts`.

```powershell
curl.exe "http://127.0.0.1:3000/api/jobs?status=completed&page=1&pageSize=20"
curl.exe http://127.0.0.1:3000/api/jobs/<jobId>
curl.exe http://127.0.0.1:3000/api/jobs/<jobId>/attempts
curl.exe -X POST http://127.0.0.1:3000/api/jobs/<jobId>/retry
```
