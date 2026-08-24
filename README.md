# taskflow-backend

Taskflow — a B2B SaaS project management tool for small agencies

## 🏗️ How to start

```bash
bun install
bun run dev
```

## 🛠️ Database seeding

```bash
bun run db:seed
```

## ⚙️ Database migrations

```bash
bun run db:generate
bun run db:migrate:dev
bun run db:migrate:deploy
```

## 🧹 Linting & Formatting

```bash
bun run lint:check       # Check lint errors
bun run lint:fix         # Fix lint errors
bun run prettier:check     # Check formatting
bun run prettier:fix     # Fix formatting
bun run lint-prettier    # Check both lint and formatting
```

## 🧪 Test

```bash
bun test
```

## 📂 Project Structure

```
taskflow_backend/
├── src/
│   ├── app.ts              # Express application entry point
│   ├── server.ts           # HTTP server setup & graceful shutdown
│   ├── config/             # Environment configuration
│   ├── lib/                # Utility functions (prisma, redis, logger, etc.)
│   ├── middlewares/        # Express middlewares (requestId, error handling)
│   ├── routes/             # API route definitions
│   ├── modules/            # Feature modules (tasks, projects, teams, etc.)
│   └── types/              # TypeScript type definitions
├── prisma/                 # Prisma schema and migrations
├── .env.example            # Environment variable template
├── package.json            # Project dependencies and scripts
└── tsconfig.json           # TypeScript configuration
```

## 📝 Environment Variables

Copy `.env.example` to `.env` and fill in your environment-specific values:

```bash
cp .env.example .env
```

Required environment variables:

```bash
# Database configuration
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Redis configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0

# JWT configuration
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# Rate limiting configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging configuration
LOG_LEVEL=info

# CORS configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```
