// auth.service.ts
import { env } from '@/config';
import { cache } from '@/lib/cache';
import { prisma } from '@/lib/prisma';
import { emailQueue } from '@/lib/queue';
import { AppError } from '@/lib/response/AppError';
import { Prisma } from '@/prisma/generated/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { AuthInputType } from './auth.schema';
import { AuthUtils } from './auth.utils';
import { OtpService } from './otp.service';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

const SALT_ROUNDS = env.SALT_ROUNDS;

// ==========================================
// 1. REGISTER
// ==========================================
const register = async (payload: AuthInputType['registerPayload']) => {
  const { email, password, firstName, lastName, gender, profileImage, agencyId, isAgreeWithTerms } =
    payload;

  const normalizedEmail = email.trim().toLowerCase();

  // Check existing verified user
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, emailVerifiedAt: true },
  });

  if (existingUser?.emailVerifiedAt) {
    throw AppError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;
  try {
    user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {
        passwordHash,
        firstName,
        lastName,
        gender,
        profileImage,
        agencyId: agencyId ?? null,
        isAgreeWithTerms,
      },
      create: {
        email: normalizedEmail,
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
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw AppError.conflict('An account with this email already exists');
    }
    throw error;
  }

  let otp;
  let otpSent = true;

  try {
    otp = await OtpService.sendOtp(normalizedEmail, 'VERIFY_EMAIL');
  } catch (error) {
    console.error('Failed to send OTP on register:', error);
    otpSent = false;
  }

  if (env.NODE_ENV === 'development') {
    return {
      user,
      otpSent,
      otp: otp ? `Account created. OTP: ${otp.code}` : undefined,
    };
  }

  return {
    user,
    otpSent,
    message: otpSent
      ? 'Account created. Please check your email for your verification code.'
      : 'Account created, but we could not deliver the verification code. Please click "Resend Code".',
  };
};

// ==========================================
// 2. VERIFY OTP & COMPLETE ACTION
// ==========================================
const verifyOtpAndCompleteAction = async (
  payload: AuthInputType['verifyOtpPayload'],
  meta: ClientMeta,
) => {
  const { code, purpose } = payload;
  const email = payload.email.trim().toLowerCase();

  // Validate OTP
  await OtpService.verifyOtp(email, purpose, code);

  switch (purpose) {
    case 'VERIFY_EMAIL': {
      const sessionDays = 7;
      const sessionExpiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
      const sessionId = crypto.randomUUID();
      const { tokenHash, refreshToken } = AuthUtils.generateOpaqueRefreshToken(sessionId);

      let user;
      try {
        user = await prisma.$transaction(async (tx) => {
          const updatedUser = await tx.user.update({
            where: { email },
            data: {
              emailVerifiedAt: new Date(),
              isActive: true,
              isRestricted: false,
            },
          });

          await tx.session.create({
            data: {
              id: sessionId,
              userId: updatedUser.id,
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

          return updatedUser;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw AppError.notFound('Account not found');
        }
        throw error;
      }

      const accessToken = await AuthUtils.signAccessToken({
        userId: user.id,
        role: user.role,
        agencyId: user.agencyId,
        sessionId,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          agencyId: user.agencyId,
        },
        accessToken,
        refreshToken,
        expiresAt: sessionExpiresAt,
      };
    }

    default:
      return { verified: true };
  }
};

// ==========================================
// 3. LOGIN
// ==========================================
const login = async (payload: AuthInputType['loginPayload'], meta: ClientMeta) => {
  const { password, fcmToken, rememberMe } = payload;
  const email = payload.email.trim().toLowerCase();

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

  // Constant-time style failure to avoid account enumeration
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
// 4. REFRESH TOKENS (RTR)
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

  // Token reuse detection: revoke session completely
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
// 5. LOGOUT
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
    // Fail silently to avoid breaking client-side logout triggers
  }
};

// ==========================================
// 6. FORGOT PASSWORD
// ==========================================
const forgotPassword = async (payload: AuthInputType['forgotPasswordPayload']) => {
  const { email } = payload;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  // Return success even if user not found to prevent user enumeration
  if (!user) {
    return { success: true };
  }

  const { rawToken, tokenHash } = AuthUtils.generateResetToken();

  // 15-minute TTL
  await cache.set(`pwd-reset:${tokenHash}`, user.id, 15 * 60);

  if (env.NODE_ENV === 'development') {
    return { success: true, resetToken: rawToken };
  }

  await emailQueue.add({
    name: 'send-password-reset',
    data: { email: user.email, resetToken: rawToken },
  });

  return { success: true };
};

// ==========================================
// 7. RESET PASSWORD
// ==========================================
const resetPassword = async (payload: AuthInputType['resetPasswordPayload']) => {
  const { token, newPassword } = payload;

  const tokenHash = AuthUtils.hashToken(token);
  const userId = await cache.get(`pwd-reset:${tokenHash}`);

  if (!userId) {
    throw AppError.badRequest('Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Update password, revoke all active sessions for security, and consume token
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    }),
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), fcmToken: null },
    }),
  ]);

  await cache.del(`pwd-reset:${tokenHash}`);

  return { success: true };
};

export const AuthService = {
  register,
  verifyOtpAndCompleteAction,
  login,
  refreshTokens,
  logout,
  forgotPassword,
  resetPassword,
};
