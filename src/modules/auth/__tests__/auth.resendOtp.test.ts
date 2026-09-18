import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userFindUnique, sendOtp } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  sendOtp: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: userFindUnique } },
}));
vi.mock('@/modules/auth/otp.service', () => ({
  OtpService: { sendOtp, verifyOtp: vi.fn() },
}));

import { AuthService } from '@/modules/auth/auth.service';

const meta = { ip: '127.0.0.1', userAgent: 'vitest' };

describe('AuthService.resendOtp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not reveal that an email is unknown', async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(
      AuthService.resendOtp({ email: 'ghost@example.com', purpose: 'VERIFY_EMAIL' }, meta),
    ).resolves.toEqual({ success: true });
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('skips sending when the email is already verified', async () => {
    userFindUnique.mockResolvedValue({ id: 'user-1', emailVerifiedAt: new Date() });

    await AuthService.resendOtp({ email: 'verified@example.com', purpose: 'VERIFY_EMAIL' }, meta);

    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('sends a normalized code for a pending account', async () => {
    userFindUnique.mockResolvedValue({ id: 'user-1', emailVerifiedAt: null });
    sendOtp.mockResolvedValue({ success: true, cooldownSeconds: 60 });

    await AuthService.resendOtp({ email: '  Pending@Example.COM ', purpose: 'VERIFY_EMAIL' }, meta);

    expect(sendOtp).toHaveBeenCalledWith('pending@example.com', 'VERIFY_EMAIL', meta);
  });
});
