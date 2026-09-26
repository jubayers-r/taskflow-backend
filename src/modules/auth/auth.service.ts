// auth.service.ts
import { env } from '@/config';
import { AuditAction, recordAudit } from '@/lib/audit';
import { cache } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { emailQueue } from '@/lib/queue';
import { getRequestContext } from '@/lib/requestContext';
import { AppError } from '@/lib/response/AppError';
import { Prisma } from '@/prisma/generated/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import * as repo from './auth.repository';
import { AuthInputType } from './auth.schemas';
import { AuthSerializer } from './auth.serializer';
import { AuthUtils } from './auth.utils';
import { OtpService } from './otp.service';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

const SALT_ROUNDS = env.SALT_ROUNDS;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ==========================================
// 1. REGISTER
// ==========================================
const register = async (payload: AuthInputType['registerPayload']) => {
  const {
    email,
    password,
    firstName,
    lastName,
    gender,
    profileImage,
    agencyName,
    isAgreeWithTerms,
  } = payload;

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await repo.findUserByEmailVerifyState(normalizedEmail);

  if (existingUser?.emailVerifiedAt) {
    throw AppError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Tenancy is server-derived. The registrant becomes OWNER of an agency
  // provisioned for them; there is no client-supplied agencyId to abuse.
  const resolvedAgencyName = agencyName?.trim() || `${firstName.trim()}'s Agency`;

  let user;
  try {
    user = await repo.registerUserWithAgency({
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      gender,
      profileImage,
      agencyName: resolvedAgencyName,
      isAgreeWithTerms,
      termsAgreedAt: new Date(),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw AppError.conflict('An account with this email already exists');
    }
    throw error;
  }

  let otp;
  let otpSent = true;

  await recordAudit({
    action: AuditAction.USER_REGISTERED,
    entityType: 'User',
    entityId: user.id,
    actorId: user.id,
    agencyId: user.agencyId,
    metadata: { email: normalizedEmail },
  });

  try {
    otp = await OtpService.sendOtp(normalizedEmail, 'VERIFY_EMAIL');
  } catch (error) {
    // The account exists either way; the user can request a new code. Logged on
    // the request-scoped logger so this line carries the same X-Request-Id as
    // the rest of the request, then the flow continues.
    (getRequestContext()?.logger ?? logger).error(
      { err: error, email: normalizedEmail },
      'Failed to send verification OTP on register',
    );
    otpSent = false;
  }

  return {
    user,
    otpSent,
    // Dev never queues the email, so the raw code is returned here instead.
    otp: env.NODE_ENV === 'development' ? otp?.code : undefined,
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

  await OtpService.verifyOtp(email, purpose, code);

  switch (purpose) {
    case 'VERIFY_EMAIL': {
      const sessionExpiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * MS_PER_DAY);
      const sessionId = crypto.randomUUID();
      const { tokenHash, refreshToken } = AuthUtils.generateOpaqueRefreshToken(sessionId);

      let user;
      try {
        user = await repo.verifyEmailAndCreateSession({
          email,
          sessionId,
          userAgent: meta.userAgent ?? null,
          ipAddress: meta.ip ?? null,
          expiresAt: sessionExpiresAt,
          tokenHash,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw AppError.notFound('Account not found');
        }
        throw error;
      }

      await recordAudit({
        action: AuditAction.EMAIL_VERIFIED,
        entityType: 'User',
        entityId: user.id,
        actorId: user.id,
        agencyId: user.agencyId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      const accessToken = await AuthUtils.signAccessToken({
        userId: user.id,
        role: user.role,
        agencyId: user.agencyId,
        sessionId,
      });

      return {
        user: AuthSerializer.authUser(user),
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

  const user = await repo.findUserByEmailForAuth(email);

  if (!user || user.deletedAt) {
    throw AppError.unauthorized('Invalid email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw AppError.accountLocked(
      `Account temporarily locked due to failed attempts. Try again in ${minutesLeft} minute(s).`,
    );
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= env.LOCKOUT_MAX_ATTEMPTS;

    if (shouldLock) {
      await repo.lockAccount(user.id, new Date(Date.now() + env.LOCKOUT_DURATION_MINUTES * 60_000));

      await recordAudit({
        action: AuditAction.ACCOUNT_LOCKED,
        entityType: 'User',
        entityId: user.id,
        actorId: user.id,
        agencyId: user.agencyId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: 'too_many_failed_logins' },
      });
    } else {
      await repo.updateLoginFailureCount(user.id, attempts);
    }

    throw AppError.unauthorized('Invalid email or password');
  }

  if (!user.emailVerifiedAt) {
    throw AppError.unauthorized('Please verify your email address to log in');
  }

  if (user.isRestricted || !user.isActive) {
    throw AppError.forbidden('Your account is inactive or restricted');
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await repo.clearLoginLockout(user.id);
  }

  const sessionDays = rememberMe ? env.SESSION_LONG_TTL_DAYS : env.SESSION_SHORT_TTL_DAYS;
  const sessionExpiresAt = new Date(Date.now() + sessionDays * MS_PER_DAY);
  const sessionId = crypto.randomUUID();
  const { tokenHash, refreshToken } = AuthUtils.generateOpaqueRefreshToken(sessionId);

  await repo.createLoginSession({
    userId: user.id,
    sessionId,
    fcmToken: fcmToken ?? null,
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ip ?? null,
    expiresAt: sessionExpiresAt,
    tokenHash,
  });

  const accessToken = await AuthUtils.signAccessToken({
    userId: user.id,
    role: user.role,
    agencyId: user.agencyId,
    sessionId,
  });

  await recordAudit({
    action: AuditAction.USER_LOGIN,
    entityType: 'User',
    entityId: user.id,
    actorId: user.id,
    agencyId: user.agencyId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { rememberMe: rememberMe ?? false },
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

  const session = await repo.findSessionWithRefreshToken(sessionId, tokenHash);

  if (!session || session.revokedAt || !session.user) {
    throw AppError.unauthorized('Session has expired or been revoked');
  }

  if (!session.user.isActive || session.user.isRestricted) {
    throw AppError.forbidden('Account access revoked');
  }

  const currentTokenRecord = session.refreshTokens[0];

  if (!currentTokenRecord || currentTokenRecord.isUsed) {
    await repo.revokeSessionById(sessionId);
    throw AppError.unauthorized('Invalid refresh token. Please sign in again.');
  }

  if (new Date() > currentTokenRecord.expiresAt) {
    throw AppError.unauthorized('Refresh token has expired');
  }

  const { tokenHash: nextTokenHash, refreshToken: nextRefreshToken } =
    AuthUtils.generateOpaqueRefreshToken(sessionId);

  const expiresAt = currentTokenRecord.expiresAt;

  await repo.rotateRefreshToken({
    currentTokenId: currentTokenRecord.id,
    sessionId,
    nextTokenHash,
    expiresAt,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

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
    await repo.logoutSessionAndToken(sessionId, tokenHash);
  } catch {
    // Fail silently to avoid breaking client-side logout triggers
  }
};

// ==========================================
// 6. FORGOT PASSWORD
// ==========================================
const forgotPassword = async (payload: AuthInputType['forgotPasswordPayload']) => {
  const { email } = payload;

  const user = await repo.findUserByEmailForReset(email);

  if (!user) {
    return { success: true };
  }

  const { rawToken, tokenHash } = AuthUtils.generateResetToken();

  await cache.set(`pwd-reset:${tokenHash}`, user.id, 15 * 60);

  await recordAudit({
    action: AuditAction.PASSWORD_RESET_REQUESTED,
    entityType: 'User',
    entityId: user.id,
    actorId: user.id,
    metadata: { email: user.email },
  });

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

  await repo.resetPasswordAndRevokeSessions(userId, passwordHash);

  await cache.del(`pwd-reset:${tokenHash}`);

  await recordAudit({
    action: AuditAction.PASSWORD_RESET,
    entityType: 'User',
    entityId: userId,
    actorId: userId,
  });

  return { success: true };
};

// ==========================================
// 8. RESEND OTP
// ==========================================
const resendOtp = async (payload: AuthInputType['resendOtpPayload'], meta: ClientMeta) => {
  const email = payload.email.trim().toLowerCase();
  const { purpose } = payload;

  const user = await repo.findUserByEmailVerifyState(email);

  if (!user) {
    return { success: true };
  }
  if (purpose === 'VERIFY_EMAIL' && user.emailVerifiedAt) {
    return { success: true };
  }

  return OtpService.sendOtp(email, purpose, meta);
};

// ==========================================
// 9. SESSIONS
// ==========================================
const listSessions = async (userId: string, currentSessionId: string) => {
  const sessions = await repo.listActiveSessionsByUserId(userId);

  return sessions.map((session) => ({
    ...session,
    isCurrent: session.id === currentSessionId,
  }));
};

const revokeSession = async (userId: string, sessionId: string) => {
  const session = await repo.findSessionOwnership(sessionId);

  if (!session || session.userId !== userId) {
    throw AppError.notFound('Session not found');
  }

  if (session.revokedAt) {
    return { success: true };
  }

  await repo.revokeSessionById(sessionId);

  await recordAudit({
    action: AuditAction.SESSION_REVOKED,
    entityType: 'Session',
    entityId: sessionId,
    actorId: userId,
  });

  return { success: true };
};

const revokeOtherSessions = async (userId: string, currentSessionId: string) => {
  const result = await repo.revokeOtherSessionsByUserId(userId, currentSessionId);

  await recordAudit({
    action: AuditAction.SESSION_REVOKED,
    entityType: 'User',
    entityId: userId,
    actorId: userId,
    metadata: { scope: 'others', count: result.count },
  });

  return { revoked: result.count };
};

export const AuthService = {
  register,
  verifyOtpAndCompleteAction,
  login,
  refreshTokens,
  logout,
  forgotPassword,
  resetPassword,
  resendOtp,
  listSessions,
  revokeSession,
  revokeOtherSessions,
};
