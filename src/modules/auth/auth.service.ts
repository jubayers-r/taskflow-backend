import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/response/AppError';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { AuthInputType } from './auth.schema';
import { AuthUtils } from './auth.utils';

// ==========================================
// 1. REGISTER
// ==========================================
const register = async (
  payload: AuthInputType['registerPayload'],
  meta: { ip?: string; userAgent?: string },
) => {
  const { email, password, firstName, lastName, gender, profileImage, agencyId, isAgreeWithTerms } =
    payload;

  if (!isAgreeWithTerms) {
    throw AppError.badRequest('You must agree with the terms and conditions');
  }
  if (!email || !password || !firstName) {
    throw AppError.badRequest('All fields are required');
  }

  // Check email collision
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw AppError.conflict('An account with this email already exists');
  }

  const sessionDays = 7;
  const sessionExpiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  const sessionId = crypto.randomUUID();
  const { tokenHash, refreshToken } = AuthUtils.generateOpaqueRefreshToken(sessionId);

  const passwordHash = await bcrypt.hash(password, 10);

  // Atomic user + session creation in ONE transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        gender,
        profileImage,
        agencyId: agencyId ?? null,
        isAgreeWithTerms,
        isActive: true,
        isRestricted: false,
      },
    });

    await tx.session.create({
      data: {
        id: sessionId,
        userId: newUser.id,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ip ?? null,
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

    return newUser;
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
// 2. LOGIN
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
      emailVerifiedAt: true,
    },
  });

  if (!user || user.deletedAt) {
    throw AppError.unauthorized('Invalid email or password');
  }

  if (!user.emailVerifiedAt) {
    throw AppError.unauthorized('Please verify your email address to log in');
  }

  if (user.isRestricted || !user.isActive) {
    throw AppError.forbidden('Your account is inactive or restricted');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const sessionDays = rememberMe ? 30 : 1;
  const sessionExpiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

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
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ip ?? null,
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
// 3. REFRESH TOKENS (RTR)
// ==========================================
const refreshTokens = async (
  incomingRefreshToken: string,
  meta: { ip?: string; userAgent?: string },
) => {
  let sessionId: string;
  let rawSecret: string;

  try {
    const parsed = AuthUtils.parseCompoundToken(incomingRefreshToken);
    sessionId = parsed.sessionId;
    rawSecret = parsed.rawSecret;
  } catch {
    throw AppError.unauthorized('Malformed refresh token');
  }

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
    throw AppError.unauthorized('Session has expired or been revoked');
  }

  if (!session.user.isActive || session.user.isRestricted) {
    throw AppError.forbidden('Account access revoked');
  }

  const currentTokenRecord = session.refreshTokens[0];

  // Breach Detection: Reuse of already used token
  if (!currentTokenRecord || currentTokenRecord.isUsed) {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
        fcmToken: null,
      },
    });
    throw AppError.unauthorized('Invalid refresh token. Please sign in again.');
  }

  // Expiration check
  if (new Date() > currentTokenRecord.expiresAt) {
    throw AppError.unauthorized('Refresh token has expired');
  }

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
// 4. LOGOUT
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
    // Fail silently so cleanups don't crash logout endpoints
  }
};

export const AuthServices = {
  register,
  login,
  refreshTokens,
  logout,
};
