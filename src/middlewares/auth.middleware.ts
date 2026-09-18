import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/response/AppError';
import { AuthUtils } from '@/modules/auth/auth.utils';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import catchAsync from '@/utils/catchAsync';

const extractBearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
};

/**
 * Verifies the access token AND that its session is still live. This closes the
 * gap where a revoked session's access token stayed valid until natural expiry.
 */
export const authenticate = catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw AppError.unauthorized('Missing access token');
  }

  let payload;
  try {
    payload = await AuthUtils.verifyAccessToken(token);
  } catch {
    throw AppError.unauthorized('Invalid or expired access token');
  }

  const sessionId = payload.sessionId;
  if (!sessionId) {
    throw AppError.unauthorized('Invalid access token');
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      revokedAt: true,
      expiresAt: true,
      user: { select: { isActive: true, isRestricted: true } },
    },
  });

  if (!session || session.revokedAt || new Date() > session.expiresAt) {
    throw AppError.unauthorized('Session has expired or been revoked');
  }

  if (!session.user.isActive || session.user.isRestricted) {
    throw AppError.forbidden('Account access revoked');
  }

  req.auth = {
    userId: payload.sub,
    role: payload.role,
    agencyId: payload.agencyId,
    sessionId,
  };

  next();
});

/** Restricts a route to the given roles. Must run after `authenticate`. */
export const authorize =
  (...roles: string[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(AppError.unauthorized());
    }
    if (roles.length > 0 && !roles.includes(req.auth.role)) {
      return next(AppError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };

/** Requires the authenticated user to belong to a tenant (agency). */
export const requireTenant = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth?.agencyId) {
    return next(AppError.forbidden('Agency context is required'));
  }
  next();
};
