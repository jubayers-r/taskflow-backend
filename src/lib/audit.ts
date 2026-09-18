import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/prisma/generated/client';

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  agencyId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Best-effort security/compliance trail. A logging failure must never break the
 * request that triggered it, so errors are logged and swallowed.
 */
export const recordAudit = async (event: AuditEvent): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        actorId: event.actorId ?? null,
        agencyId: event.agencyId ?? null,
        ipAddress: event.ip ?? null,
        userAgent: event.userAgent ?? null,
        metadata: event.metadata,
      },
    });
  } catch (err) {
    logger.error({ err, action: event.action }, 'Failed to write audit log');
  }
};

export const AuditAction = {
  USER_REGISTERED: 'USER_REGISTERED',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  SESSION_REVOKED: 'SESSION_REVOKED',
} as const;
