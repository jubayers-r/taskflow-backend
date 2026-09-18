import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userFindUnique, userUpdate, compare } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: userFindUnique, update: userUpdate } },
}));
vi.mock('bcrypt', () => ({ default: { compare, hash: vi.fn() } }));

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
    userFindUnique.mockResolvedValue({
      ...baseUser,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });

    await expect(login()).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_LOCKED });
    expect(compare).not.toHaveBeenCalled();
  });

  it('increments the failure counter on a bad password', async () => {
    userFindUnique.mockResolvedValue({ ...baseUser, failedLoginAttempts: 1 });
    compare.mockResolvedValue(false);
    userUpdate.mockResolvedValue({});

    await expect(login()).rejects.toBeInstanceOf(AppError);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failedLoginAttempts: 2 } }),
    );
  });

  it('locks the account once the max attempts is reached', async () => {
    userFindUnique.mockResolvedValue({
      ...baseUser,
      failedLoginAttempts: env.LOCKOUT_MAX_ATTEMPTS - 1,
    });
    compare.mockResolvedValue(false);
    userUpdate.mockResolvedValue({});

    await expect(login()).rejects.toBeInstanceOf(AppError);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: expect.any(Date) }),
      }),
    );
  });

  it('does not reveal deleted accounts', async () => {
    userFindUnique.mockResolvedValue({ ...baseUser, deletedAt: new Date() });

    await expect(login()).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
  });
});
