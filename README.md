# MelonisUptime

Standalone public status service for `https://melonis.wiki`. It checks the main
page, search API, fetch API, and MySQL every minute, then stores seven days of
bounded history in Redis. The dashboard displays the latest 24 hours.

The monitored HTTP origin is intentionally hardcoded. It cannot be redirected
to a different target through environment configuration.

## Requirements

- Node.js 20.9 or newer
- Persistent Redis with `noeviction` recommended
- A MySQL account that can connect and run `SELECT 1`

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`. The scheduler runs immediately and then on every
minute boundary. `/healthz` checks only HTTP process liveness; `/api/status`
returns `503` if Redis history cannot be read.

## Configuration

| Variable | Required | Purpose |
|---|---:|---|
| `REDIS_URL` | yes | Redis connection URL used for history and distributed scheduling locks |
| `DB` | yes | MySQL connection URL for the direct read-only database probe |
| `PORT` | no | HTTP port; defaults to `3000` and is supplied by Railway |
| `TEST_REDIS_URL` | tests only | Disposable Redis database used by the integration test |

Do not use public environment variables for either connection URL. Raw network,
Redis, and MySQL errors are logged on the server and are never included in the
public API.

## Railway deployment

1. Create this directory as a Railway service and add a persistent Redis service.
2. Reference the Redis private URL as `REDIS_URL`.
3. Set `DB` to a dedicated read-only MySQL user's private connection URL.
4. Confirm Redis persistence is enabled and configure `noeviction` when supported.
5. Deploy. `railway.json` builds the app, runs the custom monitoring server, and
   uses `/healthz` for process health.

The minute-keyed Redis lock makes additional application replicas safe: only one
replica records a monitoring cycle for each minute.

## Validation

```bash
npm run lint
npm run typecheck
npm test
TEST_REDIS_URL=redis://127.0.0.1:6379 npm run test:redis
npm run build
```
