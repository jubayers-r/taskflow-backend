# ---------------------------------------
# Stage 1: Build & Dependencies (Using Bun)
# ---------------------------------------
FROM oven/bun:alpine AS builder
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY prisma ./prisma
RUN bunx prisma generate

COPY . .
RUN bun build ./src/index.ts --target=node --outdir=./dist

# ---------------------------------------
# Stage 2: Production Runtime (Using Node)
# ---------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
# Install only production dependencies
RUN npm install --omit=dev --ignore-scripts

# Copy Prisma schema and engines from builder
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled JavaScript output
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 5000

CMD ["node", "dist/index.js"]