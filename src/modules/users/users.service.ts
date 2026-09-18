import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/response/AppError';

const getCurrentUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
