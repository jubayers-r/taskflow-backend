import { env } from '@/config';
import { emailBullQueue, emailQueue } from '@/lib/queue';
import { prisma } from '@/lib/prisma';
import { isRedisEnabled, redis } from '@/lib/redis';

const round = (ms: number) => Math.round(ms * 100) / 100;

const toErrorMessage = (err: unknown): string => {
  return err instanceof Error ? err.message : String(err);
};

export type DatabaseHealth = {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
};

export type RedisHealth = {
  enabled: boolean;
  status: 'up' | 'down' | 'disabled';
  latencyMs?: number;
  error?: string;
};

export type QueueHealth = {
  backend: 'bullmq-redis' | 'in-memory';
  waiting: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  error?: string;
};

export type HealthReport = {
  status: 'ok' | 'degraded' | 'down';
  project: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  database: DatabaseHealth;
  redis: RedisHealth;
  queue: QueueHealth;
};

export type LivenessReport = {
  status: 'ok';
  project: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
};

export const checkDatabase = async (): Promise<DatabaseHealth> => {
  const startedAt = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'up', latencyMs: round(performance.now() - startedAt) };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: round(performance.now() - startedAt),
      error: toErrorMessage(error),
    };
  }
};

export const checkRedis = async (): Promise<RedisHealth> => {
  if (!isRedisEnabled() || !redis) {
    return { enabled: false, status: 'disabled' };
  }

  const startedAt = performance.now();
  try {
    const pong = await redis.ping();
    return {
      enabled: true,
      status: pong === 'PONG' ? 'up' : 'down',
      latencyMs: round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      enabled: true,
      status: 'down',
      latencyMs: round(performance.now() - startedAt),
      error: toErrorMessage(error),
    };
  }
};

export const checkQueue = async (): Promise<QueueHealth> => {
  if (emailBullQueue) {
    try {
      const counts = await emailBullQueue.getJobCounts();
      return {
        backend: 'bullmq-redis',
        waiting: (counts.waiting ?? 0) + (counts.delayed ?? 0),
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    } catch (error) {
      return { backend: 'bullmq-redis', waiting: 0, error: toErrorMessage(error) };
    }
  }

  return { backend: 'in-memory', waiting: await emailQueue.pendingCount() };
};

const computeStatus = (database: DatabaseHealth, redis: RedisHealth): HealthReport['status'] => {
  if (database.status === 'down') return 'down';
  if (redis.status === 'down') return 'degraded';
  return 'ok';
};

export const getHealth = async (): Promise<HealthReport> => {
  const [database, redisInfo, queue] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkQueue(),
  ]);

  return {
    status: computeStatus(database, redisInfo),
    project: env.PROJECT_NAME,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database,
    redis: redisInfo,
    queue,
  };
};

/**
 * Liveness: is the process alive? Must NOT touch external dependencies,
 * otherwise a dependency outage would cause the orchestrator to kill a
 * perfectly healthy process.
 */
export const getLiveness = (): LivenessReport => ({
  status: 'ok',
  project: env.PROJECT_NAME,
  environment: env.NODE_ENV,
  uptimeSeconds: Math.round(process.uptime()),
  timestamp: new Date().toISOString(),
});

export const renderHealthPage = (health: HealthReport): string => {
  const dbBadge = health.database.status === 'up' ? 'UP' : 'DOWN';
  const dbLabel =
    health.database.status === 'up' ? 'Operational' : (health.database.error ?? 'Unreachable');

  const redisBadge =
    health.redis.status === 'up' ? 'UP' : health.redis.status === 'down' ? 'DOWN' : 'DISABLED';
  const redisLabel =
    health.redis.status === 'down'
      ? (health.redis.error ?? 'Unreachable')
      : health.redis.status === 'disabled'
        ? 'Not configured (USE_REDIS=false)'
        : `Connected (${health.redis.latencyMs}ms)`;

  const statusColor =
    health.status === 'ok' ? '#16a34a' : health.status === 'degraded' ? '#f59e0b' : '#dc2626';
  const queueBackend =
    health.queue.backend === 'bullmq-redis' ? 'BullMQ / Redis' : 'In-memory (no Redis)';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${health.project} — Health</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f5f7; color: #111827; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.06); width: 100%; max-width: 640px; padding: 32px; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
      .title { font-size: 20px; font-weight: 700; }
      .pill { padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; color: #fff; background: ${statusColor}; }
      .meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: #6b7280; margin-bottom: 24px; }
      .check { display: flex; align-items: center; justify-content: space-between; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 12px; }
      .check .name { font-size: 14px; font-weight: 600; }
      .check .detail { font-size: 13px; color: #6b7280; margin-top: 4px; }
      .badge { padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
      .badge.up { background: #dcfce7; color: #16a34a; }
      .badge.down { background: #fee2e2; color: #dc2626; }
      .badge.disabled { background: #e5e7eb; color: #6b7280; }
      .foot { margin-top: 16px; font-size: 12px; color: #9ca3af; text-align: center; }
      .foot a { color: #2563eb; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="head">
        <div class="title">${health.project}</div>
        <span class="pill">${health.status.toUpperCase()}</span>
      </div>
      <div class="meta">
        <span>Env: ${health.environment}</span>
        <span>Uptime: ${health.uptimeSeconds}s</span>
        <span>Checked: ${health.timestamp}</span>
      </div>

      <div class="check">
        <div>
          <div class="name">PostgreSQL Database</div>
          <div class="detail">${dbLabel}${health.database.status === 'up' ? ` · ${health.database.latencyMs}ms` : ''}</div>
        </div>
        <span class="badge ${health.database.status === 'up' ? 'up' : 'down'}">${dbBadge}</span>
      </div>

      <div class="check">
        <div>
          <div class="name">Redis</div>
          <div class="detail">${redisLabel}</div>
        </div>
        <span class="badge ${health.redis.status === 'disabled' ? 'disabled' : health.redis.status === 'up' ? 'up' : 'down'}">${redisBadge}</span>
      </div>

      <div class="check">
        <div>
          <div class="name">Email Queue</div>
          <div class="detail">${queueBackend} · ${health.queue.waiting} waiting${health.queue.failed ? ` · ${health.queue.failed} failed` : ''}</div>
        </div>
        <span class="badge up">OK</span>
      </div>

      <div class="foot"><a href="/health">Refresh</a></div>
    </div>
  </body>
</html>`;
};
