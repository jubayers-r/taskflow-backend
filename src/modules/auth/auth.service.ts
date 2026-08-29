import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { AuthUtils } from './auth.utils';

const login = async (email: string, pass: string, meta: { ip?: string; userAgent?: string }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.isRestricted || !user.isActive) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const isValid = await bcrypt.compare(pass, user.passwordHash);
  if (!isValid) throw new Error('INVALID_CREDENTIALS');

  const familyId = crypto.randomUUID();
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Store session record in DB
  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      familyId,
      userId: user.id,
      expiresAt,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      isUsed: false,
    },
  });

  const accessToken = await AuthUtils.signAccessToken({
    userId: user.id,
    role: user.role,
    agencyId: user.agencyId,
  });

  const refreshToken = await AuthUtils.signRefreshToken({
    userId: user.id,
    tokenId,
    familyId,
  });

  return { accessToken, refreshToken };
};

const refreshTokens = async (
  incomingRefreshToken: string,
  meta: { ip?: string; userAgent?: string },
) => {
  // 1. Verify token signature & expiry
  let payload;
  try {
    payload = await AuthUtils.verifyRefreshToken(incomingRefreshToken);
  } catch {
    throw new Error('INVALID_OR_EXPIRED_TOKEN');
  }

  const { tokenId, familyId, sub: userId } = payload;

  // 2. Fetch token from DB
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { id: tokenId },
  });

  if (!tokenRecord) {
    throw new Error('TOKEN_NOT_FOUND');
  }

  // 3. Breach Check: If token is already used or revoked, invalidate the family
  if (tokenRecord.isUsed || tokenRecord.revokedAt) {
    await prisma.refreshToken.deleteMany({ where: { familyId } });
    throw new Error('TOKEN_REUSE_DETECTED');
  }

  // 4. Invalidate used token & create replacement in an atomic transaction
  const nextTokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: tokenId },
      data: { isUsed: true },
    }),
    prisma.refreshToken.create({
      data: {
        id: nextTokenId,
        familyId,
        userId,
        expiresAt,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        isUsed: false,
      },
    }),
  ]);

  // 5. Fetch user metadata for access token claims
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || user.isRestricted) {
    throw new Error('USER_UNAUTHORIZED');
  }

  const newAccessToken = await AuthUtils.signAccessToken({
    userId: user.id,
    role: user.role,
    agencyId: user.agencyId,
  });

  const newRefreshToken = await AuthUtils.signRefreshToken({
    userId: user.id,
    tokenId: nextTokenId,
    familyId,
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

const logout = async (incomingRefreshToken: string) => {
  try {
    const { tokenId } = await AuthUtils.verifyRefreshToken(incomingRefreshToken);
    await prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Fail silently on invalid tokens during logout
  }
};

export const AuthServices = {
  login,
  refreshTokens,
  logout,
};
