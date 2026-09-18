# syntax=docker/dockerfile:1

# ---------------------------------------
# Stage 1: Install dependencies & generate the Prisma client
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
# Stage 2: Production runtime (Bun executes TypeScript directly)
# ---------------------------------------
FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY package.json tsconfig.json ./
COPY src ./src

USER bun
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/health/live >/dev/null 2>&1 || exit 1

CMD ["bun", "run", "src/server.ts"]
