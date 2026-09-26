import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userFindFirst } = vi.hoisted(() => ({ userFindFirst: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findFirst: userFindFirst } },
}));

import { AppError } from '@/lib/response/AppError';
import { UsersService } from '@/modules/users/users.service';
import type { AuthenticatedUser } from '@/types/express';

const auth = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  userId: 'user-1',
  role: 'MEMBER',
  agencyId: 'agency-1',
  sessionId: 'session-1',
  ...overrides,
});

describe('UsersService.getCurrentUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the selected profile fields', async () => {
    const user = { id: 'user-1', email: 'a@b.com', role: 'MEMBER' };
    userFindFirst.mockResolvedValue(user);

    await expect(UsersService.getCurrentUser(auth())).resolves.toEqual(user);
  });

  it('scopes the query by the agency from the token', async () => {
    userFindFirst.mockResolvedValue({ id: 'user-1' });

    await UsersService.getCurrentUser(auth({ agencyId: 'agency-1' }));

    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', agencyId: 'agency-1', deletedAt: null },
      }),
    );
  });

  it('scopes by a null agency instead of dropping the tenancy filter', async () => {
    userFindFirst.mockResolvedValue({ id: 'user-1' });

    await UsersService.getCurrentUser(auth({ agencyId: null }));

    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', agencyId: null, deletedAt: null },
      }),
    );
  });

  it('never queries by id alone, so a foreign-tenant id cannot leak', async () => {
    userFindFirst.mockResolvedValue({ id: 'user-1' });

    await UsersService.getCurrentUser(auth({ userId: 'user-1', agencyId: 'agency-1' }));

    const args = userFindFirst.mock.calls[0]?.[0];
    expect(args.where).toHaveProperty('agencyId');
    expect(args.where.agencyId).toBe('agency-1');
  });

  it('throws not found when the user does not exist', async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(UsersService.getCurrentUser(auth({ userId: 'missing' }))).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('throws not found when the user exists in another tenant', async () => {
    // findFirst with the agencyId filter returns null for a cross-tenant row,
    // which surfaces as 404 rather than 403 so ids are not confirmed.
    userFindFirst.mockResolvedValue(null);

    await expect(UsersService.getCurrentUser(auth({ userId: 'foreign' }))).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
