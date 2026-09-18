# taskflow-backend

Taskflow — a B2B SaaS project management tool for small agencies.

Express 5 + TypeScript REST API, run with [Bun](https://bun.sh) and [Prisma](https://www.prisma.io) (PostgreSQL). Redis is optional and used for the email queue, caching, and distributed rate limiting.

## Requirements

- [Bun](https://bun.sh) 1.2+
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

| Script                      | Description                             |
| --------------------------- | --------------------------------------- |
| `bun run dev`               | Start the dev server in watch mode      |
| `bun run db:generate`       | Generate the Prisma client              |
| `bun run db:migrate:dev`    | Create/apply a migration in development |
| `bun run db:migrate:deploy` | Apply pending migrations in production  |
| `bun run db:seed`           | Seed the database                       |
| `bun run lint:check`        | Run ESLint                              |
| `bun run lint:fix`          | Run ESLint with `--fix`                 |
| `bun run prettier:check`    | Check formatting                        |
| `bun run prettier:fix`      | Write formatting                        |
| `bun run lint-prettier`     | Lint and format check                   |
| `bun run test`              | Run the Vitest suite once               |
| `bun run test:watch`        | Run Vitest in watch mode                |

## Environment variables

Copy `.env.example` to `.env`. The important ones:

```bash
PROJECT_NAME="taskflow-backend"
NODE_ENV="development"
PORT=5000
LOG_LEVEL="info"
TRUST_PROXY=1                       # trusted reverse-proxy hops for client IP

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/taskflow_db?schema=public"

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

| Endpoint            | Description                                     |
| ------------------- | ----------------------------------------------- |
| `GET /`             | Redirects to `/health`                          |
| `GET /health`       | HTML status dashboard (database, Redis, queue)  |
| `GET /health/live`  | Liveness probe (no dependency checks)           |
| `GET /health/ready` | Readiness probe (503 when a dependency is down) |
| `GET /healthz`      | Alias for liveness                              |
| `GET /readyz`       | Alias for readiness                             |
| `GET /docs`         | Interactive API reference (Scalar)              |
| `GET /openapi.json` | OpenAPI 3.1 document                            |

Business endpoints are versioned under `/api/v1`:

| Endpoint                            | Description                 |
| ----------------------------------- | --------------------------- |
| `GET /api/v1`                       | API discovery document      |
| `GET /api/v1/auth`                  | Auth endpoint index         |
| `POST /api/v1/auth/register`        | Register a new account      |
| `POST /api/v1/auth/verify-email`    | Verify an email with an OTP |
| `POST /api/v1/auth/login`           | Log in                      |
| `POST /api/v1/auth/refresh`         | Rotate a refresh token      |
| `POST /api/v1/auth/logout`          | Revoke the current session  |
| `POST /api/v1/auth/forgot-password` | Request a password reset    |
| `POST /api/v1/auth/reset-password`  | Reset a password            |

Adding an endpoint? Register its docs with a single `describeRoute({ ... })` call next to the route definition (see `src/modules/auth/auth.routes.ts`). The OpenAPI document and Scalar UI update automatically.

## Docker

```bash
docker compose up -d --build
```

`docker-compose.yml` starts PostgreSQL (`taskflow_db`, port 5432) and Redis (port 6379). The `Dockerfile` uses Bun for both build and runtime.

## Project structure

```
src/
├── app.ts                # Express app (middleware, routes, docs)
├── server.ts             # HTTP server, process-level error handling
├── config/               # Zod-validated environment config
├── emails/               # React Email templates
├── lib/                  # prisma, redis, cache, queue, logger, openapi, response
├── middlewares/          # requestId, clientMeta, rate limiting, validation, errors
├── modules/              # feature modules (auth, health)
├── routes/               # versioned API router
├── services/             # email delivery
├── types/                # ambient TypeScript types
├── utils/                # helpers (catchAsync, gracefulShutdown)
└── workers/              # background job workers
prisma/
├── schema/               # Prisma schema (multi-file)
└── generated/            # generated Prisma client (git-ignored)
```
