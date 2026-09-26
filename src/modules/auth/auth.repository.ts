import { prisma } from '@/lib/prisma';
import type { GenderEnum, OtpChannel, OtpPurpose } from '@/prisma/generated/enums';
import { UserRole } from '@/prisma/generated/enums';

/**
 * ALL Prisma access for the auth domain lives here — users, sessions, refresh
 * tokens, and OTP records — including multi-statement transactions. Services
 * and middleware call these functions and never touch `prisma` directly, so
 * the persistence layer is mockable at exactly one boundary.
 */

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** Full auth-relevant user row for login (includes passwordHash + lockout). */
export const findUserByEmailForAuth = (email: string) =>
  prisma.user.findUnique({
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
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  });

/** Minimal row to check existence / verification state (register, resend). */
export const findUserByEmailVerifyState = (email: string) =>
  prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });

/** Row for the password-reset email flow. */
export const findUserByEmailForReset = (email: string) =>
  prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });

export interface RegisteredUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName?: string | null;
  gender: GenderEnum;
  profileImage?: string | null;
  isAgreeWithTerms: boolean;
  termsAgreedAt: Date;
}

export interface RegisteredUserResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: (typeof UserRole)[keyof typeof UserRole];
  agencyId: string | null;
}

const registeredUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  agencyId: true,
} as const;

/**
 * Creates the user account for a fresh registration. No agency is provisioned
 * here: tenancy input is never accepted from a client (an `agencyId` in the
 * body is a tenant takeover), and the account starts with `agencyId: null` and
 * the default role until an agency assigns it one.
 *
 * Re-registering an unverified email updates the profile in place and keeps
 * whatever tenancy it already has — it never mints a second agency.
 */
export const registerUser = async (input: RegisteredUserInput): Promise<RegisteredUserResult> => {
  const profile = {
    passwordHash: input.passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    gender: input.gender,
    profileImage: input.profileImage,
    isAgreeWithTerms: input.isAgreeWithTerms,
    termsAgreedAt: input.termsAgreedAt,
  };

  const existing = await findUserByEmailVerifyState(input.email);

  if (existing) {
    return prisma.user.update({
      where: { email: input.email },
      data: profile,
      select: registeredUserSelect,
    });
  }

  return prisma.user.create({
    data: {
      ...profile,
      email: input.email,
      isActive: true,
      isRestricted: false,
    },
    select: registeredUserSelect,
  });
};

// ---------------------------------------------------------------------------
// Login / brute-force lockout
// ---------------------------------------------------------------------------

export const updateLoginFailureCount = (userId: string, attempts: number) =>
  prisma.user.update({ where: { id: userId }, data: { failedLoginAttempts: attempts } });

export const lockAccount = (userId: string, lockedUntil: Date) =>
  prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil },
  });

export const clearLoginLockout = (userId: string) =>
  prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

// ---------------------------------------------------------------------------
// Email verification + sessions (transactional)
// ---------------------------------------------------------------------------

export const verifyEmailAndCreateSession = (params: {
  email: string;
  sessionId: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  tokenHash: string;
}) =>
  prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { email: params.email },
      data: { emailVerifiedAt: new Date(), isActive: true, isRestricted: false },
      select: { id: true, email: true, role: true, agencyId: true },
    });

    await tx.session.create({
      data: {
        id: params.sessionId,
        userId: user.id,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
        expiresAt: params.expiresAt,
        refreshTokens: {
          create: {
            tokenHash: params.tokenHash,
            expiresAt: params.expiresAt,
            isUsed: false,
          },
        },
      },
    });

    return user;
  });

export const createLoginSession = (params: {
  userId: string;
  sessionId: string;
  fcmToken: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  tokenHash: string;
}) =>
  prisma.$transaction(async (tx) => {
    if (params.fcmToken) {
      await tx.session.updateMany({
        where: { fcmToken: params.fcmToken },
        data: { fcmToken: null },
      });
    }

    await tx.session.create({
      data: {
        id: params.sessionId,
        userId: params.userId,
        fcmToken: params.fcmToken,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
        expiresAt: params.expiresAt,
        refreshTokens: {
          create: {
            tokenHash: params.tokenHash,
            expiresAt: params.expiresAt,
            isUsed: false,
          },
        },
      },
    });
  });

// ---------------------------------------------------------------------------
// Refresh token rotation (RTR)
// ---------------------------------------------------------------------------

export const findSessionWithRefreshToken = (sessionId: string, tokenHash: string) =>
  prisma.session.findUnique({
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
      refreshTokens: { where: { tokenHash } },
    },
  });

export const revokeSessionById = (sessionId: string) =>
  prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date(), fcmToken: null },
  });

export const rotateRefreshToken = (params: {
  currentTokenId: string;
  sessionId: string;
  nextTokenHash: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}) =>
  prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: params.currentTokenId },
      data: { isUsed: true },
    }),
    prisma.refreshToken.create({
      data: {
        sessionId: params.sessionId,
        tokenHash: params.nextTokenHash,
        expiresAt: params.expiresAt,
        isUsed: false,
      },
    }),
    prisma.session.update({
      where: { id: params.sessionId },
      data: {
        lastActiveAt: new Date(),
        ipAddress: params.ipAddress ?? undefined,
        userAgent: params.userAgent ?? undefined,
      },
    }),
  ]);

// ---------------------------------------------------------------------------
// Logout / password reset
// ---------------------------------------------------------------------------

export const logoutSessionAndToken = (sessionId: string, tokenHash: string) =>
  prisma.$transaction([
    prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), fcmToken: null },
    }),
    prisma.refreshToken.updateMany({
      where: { sessionId, tokenHash },
      data: { isUsed: true },
    }),
  ]);

export const resetPasswordAndRevokeSessions = (userId: string, passwordHash: string) =>
  prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), fcmToken: null },
    }),
  ]);

// ---------------------------------------------------------------------------
// Session listing / management
// ---------------------------------------------------------------------------

export const listActiveSessionsByUserId = (userId: string) =>
  prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      lastActiveAt: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { lastActiveAt: 'desc' },
  });

export const findSessionOwnership = (sessionId: string) =>
  prisma.session.findUnique({
    where: { id: sessionId },
    select: { userId: true, revokedAt: true },
  });

export const revokeOtherSessionsByUserId = (userId: string, currentSessionId: string) =>
  prisma.session.updateMany({
    where: { userId, id: { not: currentSessionId }, revokedAt: null },
    data: { revokedAt: new Date(), fcmToken: null },
  });

/** Used by `authenticate`: verify a session token and its owning account. */
export const findSessionWithAccountState = (sessionId: string) =>
  prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      revokedAt: true,
      expiresAt: true,
      user: { select: { isActive: true, isRestricted: true } },
    },
  });

// ---------------------------------------------------------------------------
// OTP records
// ---------------------------------------------------------------------------

export const findLatestActiveOtp = (identifier: string, purpose: OtpPurpose) =>
  prisma.otp.findFirst({
    where: { identifier, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

export const consumeActiveOtpsFor = (identifier: string, purpose: OtpPurpose) =>
  prisma.otp.updateMany({
    where: { identifier, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

export const createOtp = (data: {
  identifier: string;
  codeHash: string;
  purpose: OtpPurpose;
  channel: OtpChannel;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}) => prisma.otp.create({ data });

export const consumeOtp = (otpId: string) =>
  prisma.otp.update({ where: { id: otpId }, data: { consumedAt: new Date() } });

export const incrementOtpAttempts = (otpId: string) =>
  prisma.otp.update({ where: { id: otpId }, data: { attempts: { increment: 1 } } });
