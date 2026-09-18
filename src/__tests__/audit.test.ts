import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auditCreate } = vi.hoisted(() => ({ auditCreate: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
  prisma: { auditLog: { create: auditCreate } },
}));

import { AuditAction, recordAudit } from '@/lib/audit';

describe('recordAudit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists an audit entry', async () => {
    auditCreate.mockResolvedValue({});

    await recordAudit({
      action: AuditAction.USER_LOGIN,
      entityType: 'User',
      entityId: 'user-1',
      actorId: 'user-1',
      agencyId: null,
      metadata: { rememberMe: false },
    });

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_LOGIN',
          entityId: 'user-1',
          actorId: 'user-1',
          agencyId: null,
        }),
      }),
    );
  });

  it('swallows storage failures (best-effort)', async () => {
    auditCreate.mockRejectedValue(new Error('db down'));

    await expect(
      recordAudit({ action: AuditAction.USER_LOGIN, entityType: 'User', entityId: 'user-1' }),
    ).resolves.toBeUndefined();
  });
});
