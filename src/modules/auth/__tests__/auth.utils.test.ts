import { describe, expect, it } from 'vitest';

import { AuthUtils } from '@/modules/auth/auth.utils';

describe('AuthUtils', () => {
  it('signs and verifies access tokens', async () => {
    const token = await AuthUtils.signAccessToken({
      userId: 'user-1',
      role: 'USER',
      agencyId: null,
      sessionId: 'session-1',
    });

    const payload = await AuthUtils.verifyAccessToken(token);

    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('USER');
    expect(payload.sessionId).toBe('session-1');
    expect(payload.exp).toBeTypeOf('number');
  });

  it('hashes and verifies OTP codes', () => {
    const hash = AuthUtils.hashOtp('123456');

    expect(hash).toHaveLength(64);
    expect(AuthUtils.verifyOtpHash('123456', hash)).toBe(true);
    expect(AuthUtils.verifyOtpHash('000000', hash)).toBe(false);
  });

  it('generates opaque tokens whose hash matches', () => {
    const { refreshToken, tokenHash } = AuthUtils.generateOpaqueRefreshToken('session-1');
    const { sessionId, rawSecret } = AuthUtils.parseCompoundToken(refreshToken);

    expect(sessionId).toBe('session-1');
    expect(AuthUtils.hashToken(rawSecret)).toBe(tokenHash);
  });
});
