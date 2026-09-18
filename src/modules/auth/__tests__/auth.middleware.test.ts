import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findSessionWithAccountState } = vi.hoisted(() => ({
  findSessionWithAccountState: vi.fn(),
}));
vi.mock('@/modules/auth/auth.repository', () => ({ findSessionWithAccountState }));

import { AppError } from '@/lib/response/AppError';
import { authenticate, authorize, requireTenant } from '@/middlewares/auth.middleware';
import { AuthUtils } from '@/modules/auth/auth.utils';
import type { NextFunction, Request, Response } from 'express';

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60_000),
  user: { isActive: true, isRestricted: false },
  ...overrides,
});

const invoke = async (middleware: unknown, req: Partial<Request>) => {
  let error: unknown;
  const next = ((err?: unknown) => {
    error = err;
  }) as NextFunction;
  await (middleware as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
    req as Request,
    {} as Response,
    next,
  );
  return { error, req };
};

const bearer = async (payload: Parameters<typeof AuthUtils.signAccessToken>[0]) => ({
  headers: { authorization: `Bearer ${await AuthUtils.signAccessToken(payload)}` },
});

const tokenPayload = {
  userId: 'user-1',
  role: 'OWNER',
  agencyId: 'agency-1',
  sessionId: 'session-1',
};

describe('authenticate', () => {
  beforeEach(() => {
    findSessionWithAccountState.mockReset();
  });

  it('rejects a request without a bearer token', async () => {
    const { error } = await invoke(authenticate, { headers: {} });
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const { error } = await invoke(authenticate, {
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
  });

  it('attaches req.auth for a valid token backed by a live session', async () => {
    findSessionWithAccountState.mockResolvedValue(makeSession());
    const { error, req } = await invoke(authenticate, await bearer(tokenPayload));

    expect(error).toBeUndefined();
    expect(findSessionWithAccountState).toHaveBeenCalledWith('session-1');
    expect(req.auth).toEqual({
      userId: 'user-1',
      role: 'OWNER',
      agencyId: 'agency-1',
      sessionId: 'session-1',
    });
  });

  it('rejects a token whose session was revoked', async () => {
    findSessionWithAccountState.mockResolvedValue(makeSession({ revokedAt: new Date() }));
    const { error } = await invoke(authenticate, await bearer(tokenPayload));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
  });

  it('rejects an inactive user even with a live session', async () => {
    findSessionWithAccountState.mockResolvedValue(
      makeSession({ user: { isActive: false, isRestricted: false } }),
    );
    const { error } = await invoke(authenticate, await bearer(tokenPayload));

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(403);
  });
});

describe('authorize / requireTenant', () => {
  it('forbids roles outside the allow-list', async () => {
    const { error } = await invoke(authorize('ADMIN'), {
      auth: { ...tokenPayload },
    } as Partial<Request>);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(403);
  });

  it('requires a tenant for tenant-scoped routes', async () => {
    const { error } = await invoke(requireTenant, {
      auth: { ...tokenPayload, agencyId: null },
    } as Partial<Request>);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(403);
  });
});
