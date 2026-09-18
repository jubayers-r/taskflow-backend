import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listActiveSessionsByUserId,
  findSessionOwnership,
  revokeSessionById,
  revokeOtherSessionsByUserId,
} = vi.hoisted(() => ({
  listActiveSessionsByUserId: vi.fn(),
  findSessionOwnership: vi.fn(),
  revokeSessionById: vi.fn(),
  revokeOtherSessionsByUserId: vi.fn(),
}));

vi.mock('@/modules/auth/auth.repository', () => ({
  listActiveSessionsByUserId,
  findSessionOwnership,
  revokeSessionById,
  revokeOtherSessionsByUserId,
}));
vi.mock('@/lib/audit', () => ({
  AuditAction: { SESSION_REVOKED: 'SESSION_REVOKED' },
  recordAudit: vi.fn(),
}));

import { AppError } from '@/lib/response/AppError';
import { AuthService } from '@/modules/auth/auth.service';

const userId = 'user-1';
const currentSessionId = 'session-current';

describe('AuthService.listSessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks the current session and excludes revoked/expired rows', async () => {
    listActiveSessionsByUserId.mockResolvedValue([
      { id: currentSessionId, lastActiveAt: new Date() },
      { id: 'session-2', lastActiveAt: new Date() },
    ]);

    const result = await AuthService.listSessions(userId, currentSessionId);

    expect(listActiveSessionsByUserId).toHaveBeenCalledWith(userId);
    expect(result).toEqual([
      expect.objectContaining({ id: currentSessionId, isCurrent: true }),
      expect.objectContaining({ id: 'session-2', isCurrent: false }),
    ]);
  });
});

describe('AuthService.revokeSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects sessions that do not belong to the caller', async () => {
    findSessionOwnership.mockResolvedValue({ userId: 'someone-else', revokedAt: null });

    await expect(AuthService.revokeSession(userId, 'foreign')).rejects.toBeInstanceOf(AppError);
    expect(revokeSessionById).not.toHaveBeenCalled();
  });

  it('revokes an owned, active session', async () => {
    findSessionOwnership.mockResolvedValue({ userId, revokedAt: null });
    revokeSessionById.mockResolvedValue({});

    await expect(AuthService.revokeSession(userId, 'session-2')).resolves.toEqual({
      success: true,
    });
    expect(revokeSessionById).toHaveBeenCalledWith('session-2');
  });

  it('is idempotent for an already revoked session', async () => {
    findSessionOwnership.mockResolvedValue({ userId, revokedAt: new Date() });

    await AuthService.revokeSession(userId, 'session-2');

    expect(revokeSessionById).not.toHaveBeenCalled();
  });
});

describe('AuthService.revokeOtherSessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revokes all sessions except the current one', async () => {
    revokeOtherSessionsByUserId.mockResolvedValue({ count: 3 });

    await expect(AuthService.revokeOtherSessions(userId, currentSessionId)).resolves.toEqual({
      revoked: 3,
    });
    expect(revokeOtherSessionsByUserId).toHaveBeenCalledWith(userId, currentSessionId);
  });
});
