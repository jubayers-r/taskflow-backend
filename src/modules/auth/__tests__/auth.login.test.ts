import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findUserByEmailForAuth,
  updateLoginFailureCount,
  lockAccount,
  clearLoginLockout,
  createLoginSession,
  compare,
} = vi.hoisted(() => ({
  findUserByEmailForAuth: vi.fn(),
  updateLoginFailureCount: vi.fn(),
  lockAccount: vi.fn(),
  clearLoginLockout: vi.fn(),
  createLoginSession: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('@/modules/auth/auth.repository', () => ({
  findUserByEmailForAuth,
  updateLoginFailureCount,
  lockAccount,
  clearLoginLockout,
  createLoginSession,
}));
vi.mock('bcrypt', () => ({ default: { compare, hash: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  AuditAction: { ACCOUNT_LOCKED: 'ACCOUNT_LOCKED', USER_LOGIN: 'USER_LOGIN' },
  recordAudit: vi.fn(),
}));

import { env } from '@/config';
import { AppError, ErrorCode } from '@/lib/response/AppError';
import { AuthService } from '@/modules/auth/auth.service';

const meta = { ip: '127.0.0.1', userAgent: 'vitest' };

const baseUser = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'MEMBER',
  agencyId: null,
  passwordHash: 'stored-hash',
  isActive: true,
  isRestricted: false,
  deletedAt: null,
  emailVerifiedAt: new Date(),
  failedLoginAttempts: 0,
  lockedUntil: null as Date | null,
};

const login = () =>
  AuthService.login(
    { email: 'user@example.com', password: 'WrongPass1!', rememberMe: false },
    meta,
  );

describe('AuthService.login lockout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a locked account before checking the password', async () => {
    findUserByEmailForAuth.mockResolvedValue({
      ...baseUser,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });

    await expect(login()).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_LOCKED });
    expect(compare).not.toHaveBeenCalled();
  });

  it('increments the failure counter on a bad password', async () => {
    findUserByEmailForAuth.mockResolvedValue({ ...baseUser, failedLoginAttempts: 1 });
    compare.mockResolvedValue(false);

    await expect(login()).rejects.toBeInstanceOf(AppError);
    expect(updateLoginFailureCount).toHaveBeenCalledWith('user-1', 2);
    expect(lockAccount).not.toHaveBeenCalled();
  });

  it('locks the account once the max attempts is reached', async () => {
    findUserByEmailForAuth.mockResolvedValue({
      ...baseUser,
      failedLoginAttempts: env.LOCKOUT_MAX_ATTEMPTS - 1,
    });
    compare.mockResolvedValue(false);

    await expect(login()).rejects.toBeInstanceOf(AppError);
    expect(lockAccount).toHaveBeenCalledWith('user-1', expect.any(Date));
    expect(updateLoginFailureCount).not.toHaveBeenCalled();
    expect(createLoginSession).not.toHaveBeenCalled();
  });

  it('does not reveal deleted accounts', async () => {
    findUserByEmailForAuth.mockResolvedValue({ ...baseUser, deletedAt: new Date() });

    await expect(login()).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
  });
});
