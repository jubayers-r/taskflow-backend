import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const RETENTION_MS = MS_PER_DAY;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Deletes expired / already-consumed security rows. Safe to run on every
 * instance: the operations are idempotent and scoped to stale data.
 */
export const runCleanup = async () => {
  const now = new Date();
  const retentionCutoff = new Date(now.getTime() - RETENTION_MS);

  const [otps, refreshTokens, sessions] = await Promise.all([
    // Expired OTPs, plus consumed ones older than the retention window.
    prisma.otp.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { consumedAt: { lt: retentionCutoff } }],
      },
    }),
    // Rotated/expired refresh tokens; live tokens are left untouched.
    prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { isUsed: true, createdAt: { lt: retentionCutoff } }],
      },
    }),
    // Expired or long-revoked sessions (cascades to their refresh tokens).
    prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: retentionCutoff } }],
      },
    }),
  ]);

  const summary = {
    otps: otps.count,
    refreshTokens: refreshTokens.count,
    sessions: sessions.count,
  };

  logger.info(summary, 'Retention cleanup completed');
  return summary;
};

export const startCleanupJob = () => {
  if (timer) return;

  timer = setInterval(() => {
    void runCleanup().catch((err) => logger.error({ err }, 'Retention cleanup failed'));
  }, CLEANUP_INTERVAL_MS);

  // Do not keep the event loop alive solely for cleanup.
  timer.unref?.();
  logger.info('Retention cleanup job scheduled');
};

export const stopCleanupJob = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};
