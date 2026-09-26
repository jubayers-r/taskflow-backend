# taskflow-backend

Taskflow — a B2B SaaS project management tool for small agencies.

Express 5 + TypeScript REST API, run with [Bun](https://bun.sh) and [Prisma](https://www.prisma.io) (PostgreSQL). Redis is optional and used for the email queue, caching, and distributed rate limiting.

## Requirements

- [Bun](https://bun.sh) 1.3+ (CI pins `1.3.9`)
- PostgreSQL 16+
- Redis 7+ (optional; enable with `USE_REDIS=true`)

## Getting started

```bash
bun install
cp .env.example .env      # then fill in the values
bun run db:generate       # generate the Prisma client
bun run db:migrate:dev    # apply migrations
bun run dev               # http://localhost:5000
```

## Scripts

| Script                      | Description                                         |
| --------------------------- | --------------------------------------------------- |
| `bun run dev`               | Start the dev server in watch mode                  |
| `bun run db:generate`       | Generate the Prisma client                          |
| `bun run db:migrate:dev`    | Create/apply a migration in development             |
| `bun run db:migrate:deploy` | Apply pending migrations in production              |
| `bun run db:seed`           | Seed the database                                   |
| `bun run lint:check`        | Run ESLint                                          |
| `bun run lint:fix`          | Run ESLint with `--fix`                             |
| `bun run prettier:check`    | Check formatting                                    |
| `bun run prettier:fix`      | Write formatting                                    |
| `bun run lint-prettier`     | Lint and format check                               |
| `bun run test`              | Run the Vitest suite once                           |
| `bun run test:watch`        | Run Vitest in watch mode                            |
| `bun run test:coverage`     | Run Vitest with a coverage gate                     |
| `bun run verify`            | Generate client + typecheck + lint + format + tests |

Integration suites need a real, migrated Postgres. They run when
`TEST_DATABASE_URL` is set and **skip silently** when it is not, so a green local
run is not evidence that they passed. Apply the schema first:

```bash
bunx prisma migrate deploy   # runs against TEST_DATABASE_URL when it is set
bun run test
```

Keep the test database disposable — the suites create and delete rows. On Neon,
use a dedicated branch. Note that `TEST_DATABASE_URL` replaces `DATABASE_URL` for
the whole process, `bun run dev` included, so remove it when you are done.

## Environment variables

Copy `.env.example` to `.env`. The important ones:

```bash
PROJECT_NAME="taskflow-backend"
NODE_ENV="development"
PORT=5000
LOG_LEVEL="info"
TRUST_PROXY=1                       # trusted reverse-proxy hops for client IP

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/taskflow_db?schema=public"

# Optional. Set it to run the integration suites; leave it unset and they skip.
# It REPLACES DATABASE_URL for the entire process, so keep it pointed at a
# throwaway database.
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/taskflow_test?schema=public"

# Redis is optional. When disabled, in-memory queue/cache/rate-limit fallbacks are used.
USE_REDIS=false
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD=""

ALLOWED_ORIGINS="http://localhost:3000, http://localhost:5173"

JWT_ACCESS_SECRET="your-secret-here"
JWT_ACCESS_EXPIRES_IN="15m"
SALT_ROUNDS=12
# At least 32 characters. Generate with e.g. `openssl rand -hex 32`.
OTP_PEPPER_SECRET="change-me-to-a-random-32+char-secret"

EMAIL_PROVIDER="resend"             # or "gmail"
EMAIL_FROM="auth@yourdomain.com"
RESEND_API_KEY="your-api-key-here"  # required when EMAIL_PROVIDER=resend
GMAIL_APP_PASSWORD="your-app-password-here" # required when EMAIL_PROVIDER=gmail
```

Configuration is validated at startup with Zod; the process refuses to boot on invalid or missing values.

## API

Operational endpoints are unversioned (for probes, load balancers, and dashboards):

| Endpoint            | Description                                        |
| ------------------- | -------------------------------------------------- |
| `GET /`             | Redirects to `/health`                             |
| `GET /health`       | HTML status dashboard (database, Redis, queue)     |
| `GET /health/live`  | Liveness probe (no dependency checks)              |
| `GET /health/ready` | Readiness probe (503 when a dependency is down)    |
| `GET /healthz`      | Alias for liveness                                 |
| `GET /readyz`       | Alias for readiness                                |
| `GET /docs`         | Interactive API reference (Scalar)                 |
| `GET /openapi.json` | OpenAPI 3.1 document                               |
| `GET /metrics`      | Prometheus metrics (unthrottled, pre-limiter)      |
| `GET /admin/queues` | Bull Board queue dashboard (only when Redis is on) |

Business endpoints are versioned under `/api/v1`:

| Endpoint                            | Description                                        |
| ----------------------------------- | -------------------------------------------------- |
| `GET /api/v1`                       | Service metadata + links to the generated contract |
| `POST /api/v1/auth/register`        | Register a new account                             |
| `POST /api/v1/auth/verify-email`    | Verify an email with an OTP                        |
| `POST /api/v1/auth/login`           | Log in                                             |
| `POST /api/v1/auth/refresh`         | Rotate a refresh token                             |
| `POST /api/v1/auth/logout`          | Revoke the current session                         |
| `POST /api/v1/auth/forgot-password` | Request a password reset                           |
| `POST /api/v1/auth/reset-password`  | Reset a password                                   |
| `POST /api/v1/auth/resend-otp`      | Resend a verification code                         |
| `GET /api/v1/auth/me`               | Current user (legacy alias of `/users/me`)         |
| `GET /api/v1/auth/sessions`         | List active sessions                               |
| `DELETE /api/v1/auth/sessions`      | Revoke every session but the current one           |
| `DELETE /api/v1/auth/sessions/:id`  | Revoke one specific session                        |
| `GET /api/v1/users/me`              | Current user profile                               |

Adding an endpoint? Register its docs with a single `describeRoute({ ... })` call
next to the route definition (see `src/modules/auth/auth.routes.ts`). Write the
path exactly as Express declares it — `:id`, not `{id}`; `describeRoute` rewrites
it to OpenAPI templating. `src/__tests__/routeDocs.test.ts` fails the build if a
mounted route is left undocumented, so this is enforced, not a convention.

**Do not hand-write an endpoint index.** A route module used to serve
`GET /api/v1/auth` listing its own endpoints, and that list was already stale at
10 of 12 — the drift is invisible until someone trusts it. `/docs` and
`/openapi.json` are generated from the `describeRoute()` calls, so they cannot
drift. Resource collections have no collection-level `GET`; hitting one returns
the standard 404 envelope, which points back at `/docs` in its body and via a
`Link: </docs>; rel="describedby"` header.

## Docker

```bash
docker compose up -d --build
```

`docker-compose.yml` starts PostgreSQL (`taskflow_db`, port 5432) and Redis (port 6379), runs migrations, then starts the API. The `Dockerfile` uses Bun for both build and runtime:

- three stages: `builder` (full deps + Prisma client generation), `migrate` (Prisma CLI only, for one-shot `migrate deploy`), and `runner` (production deps only, `USER bun`, `/health/live` HEALTHCHECK).

## Production deployment

```bash
cp .env.production.example .env.production   # fill in real secrets
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` adds, relative to the dev stack:

- **Hardened runtime** — `USE_REDIS=true` (default token/rate-limit store), non-root container, health/readiness probes, rotated JSON logs.
- **Automated schema migration** — a `migrate` service that runs `prisma migrate deploy` and gates the app on its success.
- **Nightly backups** — a `postgres-backup` sidecar runs `pg_dump` at 02:00 UTC into a named volume with retention (14 days / 4 weeks / 3 months).

  A backup on the same disk is not a backup. Push it offsite daily:
  `RCLONE_REMOTE="backups3:taskflow-backups" ./scripts/backup-offsite.sh` (cron the host execute this, or run it in a scheduler container).

  Test restores before you need them:
  `DATABASE_URL="..." ./scripts/restore-db.sh /backups/daily/db_*.dump.gz`

- **Uptime monitoring (optional)** — `uptime-kuma` is available under the `monitoring` profile; point it at `/health/live`.

### Zero-downtime deploys

The GitHub Actions workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the image to GitHub Container Registry on a `v*` tag (or manual dispatch), then over SSH pulls the image, runs `migrate deploy`, and recreates the app container. The server needs this repo checked out at `/opt/taskflow` with a populated `.env.production`, plus the repository secrets `PROD_HOST`, `PROD_USER`, `SSH_PRIVATE_KEY`.

During a deploy the app restarts; because the failure path is rolled forward by `migrate deploy`, schema changes are never ahead of the running code for more than the container restart window.

## Observability

- **Logs** — structured JSON via [pino](https://getpino.io), request-correlated with `X-Request-Id`. Sensitive fields (passwords, OTP codes, tokens, authorization headers) are redacted at the sink. Request logs are level-aware: `error` ≥500, `warn` ≥400, `info` otherwise, and `debug` for health/metrics probes so scrapers don't flood production logs.
- **Metrics** — Prometheus at `GET /metrics` (before the rate limiter so scrapers are never throttled). Collected with the Bun-runtime [`@prometheus-io/client`](https://github.com/prometheus/client_js) (the renamed successor of `prom-client`); set `Content-Type` from the registry's own `contentType`. Exposes `taskflow_`-prefixed process metrics plus `taskflow_http_requests_total`, `taskflow_http_request_duration_seconds`, and `taskflow_http_inflight_requests`. Labels are `method`, `route` (the Express route pattern, never the raw path), `status_code`, and `client` (`authenticated|anonymous`) — all bounded, so cardinality stays fixed regardless of traffic. Point Prometheus at `http://<app>:5000/metrics` and use [Grafana 19659](https://grafana.com/grafana/dashboards/19659-bun/) for the defaults.
- **Errors** — unhandled/`OperationalError`-unknown failures are captured to [Sentry](https://sentry.io) when `SENTRY_DSN` is set (no-op otherwise). Set `SENTRY_TRACES_SAMPLE_RATE` (default `0.1`) to trade tracing volume against cost.

## Docs & guidelines

- **Canonical module guide** — [`docs/module-guide.md`](docs/module-guide.md). Every feature module follows one anatomy: `routes → schemas → controller → service → (optional repository) → serializer → colocated tests`. Plain CRUD calls `prisma` from the service directly; a `repository.ts` is only added for transactional/multi-step flows. Tenant reads use `findFirst({ id, agencyId })` (→ 404); every endpoint ships a `describeRoute` and colocated tests.
- **Feature specs** — [`docs/feature-specs.md`](docs/feature-specs.md). Back-of-the-envelope contracts for the upcoming Projects & Tasks modules (not built yet).
- **Deferred work** — [`BACKLOG.md`](BACKLOG.md). Agencies/team management, billing, file uploads, multi-agency, concurrency, and why each was pushed.

## Project structure

```
src/
├── app.ts                # Express app (middleware, routes, docs)
├── server.ts             # HTTP server, process-level error handling
├── config/               # Zod-validated environment config
├── emails/               # React Email templates
├── lib/                  # prisma, redis, cache, queue, logger, openapi, response
├── middlewares/          # requestId, clientMeta, rate limiting, validation, errors
├── modules/              # feature modules (auth, health, users)
├── routes/               # versioned API router
├── services/             # email delivery
├── types/                # ambient TypeScript types
├── utils/                # helpers (catchAsync, gracefulShutdown)
└── workers/              # background job workers
prisma/
├── schema/               # Prisma schema (multi-file)
└── generated/            # generated Prisma client (git-ignored)
```
