import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionFindMany, sessionFindUnique, sessionUpdate, sessionUpdateMany } = vi.hoisted(() => ({
  sessionFindMany: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionUpdateMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findMany: sessionFindMany,
      findUnique: sessionFindUnique,
      update: sessionUpdate,
      updateMany: sessionUpdateMany,
    },
  },
}));

import { AppError } from '@/lib/response/AppError';
import { AuthService } from '@/modules/auth/auth.service';

const userId = 'user-1';
const currentSessionId = 'session-current';

describe('AuthService.listSessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks the current session and excludes revoked/expired rows', async () => {
    sessionFindMany.mockResolvedValue([
      { id: currentSessionId, lastActiveAt: new Date() },
      { id: 'session-2', lastActiveAt: new Date() },
    ]);

    const result = await AuthService.listSessions(userId, currentSessionId);

    expect(sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({ id: currentSessionId, isCurrent: true }),
      expect.objectContaining({ id: 'session-2', isCurrent: false }),
    ]);
  });
});

describe('AuthService.revokeSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects sessions that do not belong to the caller', async () => {
    sessionFindUnique.mockResolvedValue({ userId: 'someone-else', revokedAt: null });

    await expect(AuthService.revokeSession(userId, 'foreign')).rejects.toBeInstanceOf(AppError);
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('revokes an owned, active session', async () => {
    sessionFindUnique.mockResolvedValue({ userId, revokedAt: null });
    sessionUpdate.mockResolvedValue({});

    await expect(AuthService.revokeSession(userId, 'session-2')).resolves.toEqual({
      success: true,
    });
    expect(sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-2' },
        data: expect.objectContaining({ revokedAt: expect.any(Date), fcmToken: null }),
      }),
    );
  });

  it('is idempotent for an already revoked session', async () => {
    sessionFindUnique.mockResolvedValue({ userId, revokedAt: new Date() });

    await AuthService.revokeSession(userId, 'session-2');

    expect(sessionUpdate).not.toHaveBeenCalled();
  });
});

describe('AuthService.revokeOtherSessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revokes all sessions except the current one', async () => {
    sessionUpdateMany.mockResolvedValue({ count: 3 });

    await expect(AuthService.revokeOtherSessions(userId, currentSessionId)).resolves.toEqual({
      revoked: 3,
    });
    expect(sessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, id: { not: currentSessionId }, revokedAt: null },
      }),
    );
  });
});
