// users.service.ts
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/response/AppError';
import type { AuthenticatedUser } from '@/types/express';

/**
 * Reads the authenticated user's own record.
 *
 * Scoped by BOTH the id and the agency from the verified token, never by a
 * caller-supplied value. A bare `findUnique({ where: { id } })` is only safe
 * while every caller happens to pass a trusted id; scoping by tenancy keeps the
 * query correct even if a future caller passes an attacker-controlled one.
 */
const getCurrentUser = async (auth: AuthenticatedUser) => {
  const user = await prisma.user.findFirst({
    where: {
      id: auth.userId,
      agencyId: auth.agencyId ?? null,
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      agencyId: true,
      profileImage: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw AppError.notFound('User not found');
  }

  return user;
};

export const UsersService = {
  getCurrentUser,
};
