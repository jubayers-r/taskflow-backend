// auth.service.ts
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/response/AppError';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { AuthInputType } from './auth.schema';
import { AuthUtils } from './auth.utils';
import { OtpService } from './otp.service';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

// ==========================================
// 1. REGISTER
// ==========================================
const register = async (payload: AuthInputType['registerPayload'], meta: ClientMeta) => {
  const { email, password, firstName, lastName, gender, profileImage, agencyId, isAgreeWithTerms } =
    payload;

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

  const passwordHash = await bcrypt.hash(password, 12); // standard bcrypt work factor

  // Atomic user + session creation in one transaction
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

const verifyOtpAndCompleteAction = async (
  payload: AuthInputType['verifyOtpPayload'],
  meta: ClientMeta,
) => {
  const { email, code, purpose } = payload;

  // 1. Verify code validity, attempt count, and expiration
  await OtpService.verifyOtp(email, purpose, code);

  // 2. Branch according to the business intent
  switch (purpose) {
    case 'VERIFY_EMAIL': {
      const user = await prisma.user.update({
        where: { email },
        data: {
          emailVerifiedAt: new Date(),
          isActive: true,
          isRestricted: false,
        },
      });

      // Automatically log them in (create active session)
      const sessionDays = 7;
      const sessionExpiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
      const sessionId = crypto.randomUUID();
      const { tokenHash, refreshToken } = AuthUtils.generateOpaqueRefreshToken(sessionId);

      await prisma.session.create({
        data: {
          id: sessionId,
          userId: user.id,
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

      const accessToken = await AuthUtils.signAccessToken({
        userId: user.id,
        role: user.role,
        agencyId: user.agencyId,
        sessionId,
      });

      return { user, accessToken, refreshToken, expiresAt: sessionExpiresAt };
    }

    case 'PASSWORD_RESET': {
      // Return a short-lived, single-use token authorizing the actual reset form
      const resetToken = crypto.randomBytes(32).toString('hex');
      // Store token hash in redis/DB with a 15-minute TTL to authorize POST /auth/reset-password
      return { resetToken };
    }

    default:
      return { verified: true };
  }
};

// ==========================================
// 2. LOGIN
// ==========================================
const login = async (payload: AuthInputType['loginPayload'], meta: ClientMeta) => {
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

  // Use uniform response for security (prevent email enumeration)
  if (!user || user.deletedAt) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw AppError.unauthorized('Invalid email or password');
  }

  if (!user.emailVerifiedAt) {
    throw AppError.unauthorized('Please verify your email address to log in');
  }

  if (user.isRestricted || !user.isActive) {
    throw AppError.forbidden('Your account is inactive or restricted');
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
const refreshTokens = async (incomingRefreshToken: string, meta: ClientMeta) => {
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

  // Breach Detection: Reuse of already used token triggers full session kill
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

  // Rotate token atomically
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
        where: { sessionId, tokenHash },
        data: { isUsed: true },
      }),
    ]);
  } catch {
    // Fail silently so cleanups don't crash logout endpoints
  }
};

export const AuthService = {
  register,
  verifyOtpAndCompleteAction,
  login,
  refreshTokens,
  logout,
};
