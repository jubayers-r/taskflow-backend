// otp.service.ts
import { env } from '@/config';
import { emailQueue } from '@/lib/queue';
import { AppError } from '@/lib/response/AppError';
import { OtpChannel, OtpPurpose } from '@/prisma/generated/enums';
import * as repo from './auth.repository';
import { AuthUtils } from './auth.utils';

const sendOtp = async (
  identifier: string,
  purpose: OtpPurpose,
  meta?: { ip?: string; userAgent?: string },
) => {
  const latestActive = await repo.findLatestActiveOtp(identifier, purpose);

  // No resend cooldown in local development: the code is returned in the
  // response body there anyway, so waiting a minute only slows the flow down.
  if (latestActive && env.NODE_ENV !== 'development') {
    const elapsedSeconds = (Date.now() - latestActive.lastSentAt.getTime()) / 1000;
    if (elapsedSeconds < 60) {
      throw AppError.tooManyRequests(
        `Please wait ${Math.ceil(60 - elapsedSeconds)}s before requesting a new code`,
      );
    }
  }

  await repo.consumeActiveOtpsFor(identifier, purpose);

  const rawCode = AuthUtils.generateOtpCode();
  const codeHash = AuthUtils.hashOtp(rawCode);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await repo.createOtp({
    identifier,
    codeHash,
    purpose,
    channel: OtpChannel.EMAIL,
    expiresAt,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  if (env.NODE_ENV === 'development') {
    return { success: true, code: rawCode };
  }

  await emailQueue.add({
    name: 'send-otp',
    data: {
      email: identifier,
      code: rawCode,
      purpose,
    },
  });

  return { success: true, cooldownSeconds: 60 };
};

const verifyOtp = async (identifier: string, purpose: OtpPurpose, code: string) => {
  const record = await repo.findLatestActiveOtp(identifier, purpose);

  if (!record) {
    throw AppError.unauthorized('Verification code expired or not found');
  }

  if (new Date() > record.expiresAt) {
    await repo.consumeOtp(record.id);
    throw AppError.unauthorized('Verification code has expired');
  }

  if (record.attempts >= record.maxAttempts) {
    await repo.consumeOtp(record.id);
    throw AppError.unauthorized('Too many failed attempts. Request a new code.');
  }

  const isValid = AuthUtils.verifyOtpHash(code, record.codeHash);
  if (!isValid) {
    await repo.incrementOtpAttempts(record.id);
    throw AppError.unauthorized('Invalid verification code');
  }

  await repo.consumeOtp(record.id);

  return true;
};

export const OtpService = {
  sendOtp,
  verifyOtp,
};
