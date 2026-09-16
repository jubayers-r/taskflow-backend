import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { AuthInputType } from './auth.schema';
import { AuthUtils } from './auth.utils';

// ==========================================
// 1. LOGIN
// ==========================================
const login = async (
  payload: AuthInputType['loginPayload'],
  meta: { ip?: string; userAgent?: string },
) => {
  const { email, password, fcmToken, rememberMe } = payload;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      agencyId: true,
      passwordHash: true,
      isActive: true,
      isRestricted: true,
      deletedAt: true,
    },
  });

  if (!user || user.isRestricted || !user.isActive || user.deletedAt) {
    throw new Error('USER_UNAUTHORIZED');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) throw new Error('INVALID_CREDENTIALS');

  const sessionDays = rememberMe ? 30 : 1;
  const sessionExpiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

  // Generate Opaque Token
  const sessionId = crypto.randomUUID();
  const { tokenHash, refreshToken } = AuthUtils.generateOpaqueRefreshToken(sessionId);

  await prisma.$transaction(async (tx) => {
    if (fcmToken) {
      await tx.session.updateMany({
        where: { fcmToken },
        data: { fcmToken: null },
      });
    }

    await tx.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        fcmToken: fcmToken ?? null,
        userAgent: meta.userAgent,
        ipAddress: meta.ip,
        expiresAt: sessionExpiresAt,
        refreshTokens: {
          create: {
            tokenHash,
            expiresAt: sessionExpiresAt,
            isUsed: false,
          },
        },
      },
    });
  });

  const accessToken = await AuthUtils.signAccessToken({
    userId: user.id,
    role: user.role,
    agencyId: user.agencyId,
    sessionId,
  });

  return {
    accessToken,
    refreshToken,
    expiresAt: sessionExpiresAt,
  };
};

// ==========================================
// 2. REFRESH TOKENS (RTR)
// ==========================================
const refreshTokens = async (
  incomingRefreshToken: string,
  meta: { ip?: string; userAgent?: string },
) => {
  const { sessionId, rawSecret } = AuthUtils.parseCompoundToken(incomingRefreshToken);
  const tokenHash = AuthUtils.hashToken(rawSecret);

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          agencyId: true,
          isActive: true,
          isRestricted: true,
        },
      },
      refreshTokens: {
        where: { tokenHash },
      },
    },
  });

  if (!session || session.revokedAt || !session.user) {
    throw new Error('SESSION_REVOKED_OR_EXPIRED');
  }

  if (!session.user.isActive || session.user.isRestricted) {
    throw new Error('USER_UNAUTHORIZED');
  }

  const currentTokenRecord = session.refreshTokens[0];

  // Breach Detection: token not found or already used
  if (!currentTokenRecord || currentTokenRecord.isUsed) {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
        fcmToken: null,
      },
    });
    throw new Error('TOKEN_REUSE_DETECTED');
  }

  // Check Expiration
  if (new Date() > currentTokenRecord.expiresAt) {
    throw new Error('TOKEN_EXPIRED');
  }

  // Generate next rotation secret
  const { tokenHash: nextTokenHash, refreshToken: nextRefreshToken } =
    AuthUtils.generateOpaqueRefreshToken(sessionId);

  const expiresAt = currentTokenRecord.expiresAt;

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: currentTokenRecord.id },
      data: { isUsed: true },
    }),
    prisma.refreshToken.create({
      data: {
        sessionId,
        tokenHash: nextTokenHash,
        expiresAt,
        isUsed: false,
      },
    }),
    prisma.session.update({
      where: { id: sessionId },
      data: {
        lastActiveAt: new Date(),
        ipAddress: meta.ip ?? session.ipAddress,
        userAgent: meta.userAgent ?? session.userAgent,
      },
    }),
  ]);

  const accessToken = await AuthUtils.signAccessToken({
    userId: session.user.id,
    role: session.user.role,
    agencyId: session.user.agencyId,
    sessionId: session.id,
  });

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresAt,
  };
};

// ==========================================
// 3. LOGOUT
// ==========================================
const logout = async (incomingRefreshToken: string) => {
  try {
    const { sessionId, rawSecret } = AuthUtils.parseCompoundToken(incomingRefreshToken);
    const tokenHash = AuthUtils.hashToken(rawSecret);

    await prisma.$transaction([
      prisma.session.update({
        where: { id: sessionId },
        data: {
          revokedAt: new Date(),
          fcmToken: null,
        },
      }),
      prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { isUsed: true },
      }),
    ]);
  } catch {
    // Fail silently during logout
  }
};

export const AuthServices = {
  login,
  refreshTokens,
  logout,
};
