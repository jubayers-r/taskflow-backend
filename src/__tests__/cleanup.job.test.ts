import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { otpDeleteMany, refreshTokenDeleteMany, sessionDeleteMany } = vi.hoisted(() => ({
  otpDeleteMany: vi.fn(),
  refreshTokenDeleteMany: vi.fn(),
  sessionDeleteMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    otp: { deleteMany: otpDeleteMany },
    refreshToken: { deleteMany: refreshTokenDeleteMany },
    session: { deleteMany: sessionDeleteMany },
  },
}));

import { runCleanup, startCleanupJob, stopCleanupJob } from '@/jobs/cleanup.job';

const HOUR_MS = 60 * 60 * 1000;

describe('cleanup job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    otpDeleteMany.mockResolvedValue({ count: 1 });
    refreshTokenDeleteMany.mockResolvedValue({ count: 2 });
    sessionDeleteMany.mockResolvedValue({ count: 3 });
  });

  afterEach(() => {
    stopCleanupJob();
    vi.useRealTimers();
  });

  it('reports how many stale rows were removed', async () => {
    await expect(runCleanup()).resolves.toEqual({ otps: 1, refreshTokens: 2, sessions: 3 });
  });

  it('schedules hourly cleanup and is idempotent', async () => {
    vi.useFakeTimers();

    startCleanupJob();
    startCleanupJob();

    await vi.advanceTimersByTimeAsync(HOUR_MS);

    expect(sessionDeleteMany).toHaveBeenCalledTimes(1);
  });

  it('stops the scheduled cleanup', async () => {
    vi.useFakeTimers();

    startCleanupJob();
    stopCleanupJob();

    await vi.advanceTimersByTimeAsync(HOUR_MS * 2);

    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });
});
