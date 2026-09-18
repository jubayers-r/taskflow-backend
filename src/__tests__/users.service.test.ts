import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userFindUnique } = vi.hoisted(() => ({ userFindUnique: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: userFindUnique } },
}));

import { AppError } from '@/lib/response/AppError';
import { UsersService } from '@/modules/users/users.service';

describe('UsersService.getCurrentUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the selected profile fields', async () => {
    const user = { id: 'user-1', email: 'a@b.com', role: 'MEMBER' };
    userFindUnique.mockResolvedValue(user);

    await expect(UsersService.getCurrentUser('user-1')).resolves.toEqual(user);
    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
  });

  it('throws not found when the user does not exist', async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(UsersService.getCurrentUser('missing')).rejects.toBeInstanceOf(AppError);
  });
});
