# syntax=docker/dockerfile:1

# ---------------------------------------
# Stage 1: Builder — full dependency layer + Prisma client generation
# ---------------------------------------
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY prisma.config.ts ./
COPY prisma ./prisma
# Prisma's config reads DATABASE_URL at generation time; a syntactically valid
# placeholder is enough because generating does not connect to the database.
RUN DATABASE_URL="postgresql://prisma:prisma@localhost:5432/prisma?schema=public" \
  bunx prisma generate

# ---------------------------------------
# Stage 2: Migrate — one-shot `prisma migrate deploy`
# ---------------------------------------
FROM oven/bun:1-alpine AS migrate
WORKDIR /app

COPY package.json bun.lock ./
# Migrations only need the Prisma CLI (a devDependency); scripts are skipped.
RUN bun install --frozen-lockfile --ignore-scripts

COPY prisma.config.ts ./
COPY prisma ./prisma

CMD ["bunx", "prisma", "migrate", "deploy"]

# ---------------------------------------
# Stage 3: Runner — production dependencies only, non-root
# ---------------------------------------
FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install only declared production dependencies. The Prisma client was already
# generated in the builder stage, so no scripts need to run here — this keeps
# dev-only packages (eslint, vitest, prisma CLI, ...) out of the runtime image.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY --from=builder /app/prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

USER bun
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/health/live >/dev/null 2>&1 || exit 1

CMD ["bun", "run", "src/server.ts"]