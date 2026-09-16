// otp.service.ts
import { prisma } from '@/lib/prisma';
import { emailQueue } from '@/lib/queue';
import { AppError } from '@/lib/response/AppError';
import { OtpChannel, OtpPurpose } from '@/prisma/generated/enums';
import { AuthUtils } from './auth.utils';

const sendOtp = async (
  identifier: string,
  purpose: OtpPurpose,
  meta?: { ip?: string; userAgent?: string },
) => {
  const latestActive = await prisma.otp.findFirst({
    where: { identifier, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (latestActive) {
    const elapsedSeconds = (Date.now() - latestActive.lastSentAt.getTime()) / 1000;
    if (elapsedSeconds < 60) {
      throw AppError.tooManyRequests(
        `Please wait ${Math.ceil(60 - elapsedSeconds)}s before requesting a new code`,
      );
    }
  }

  await prisma.otp.updateMany({
    where: { identifier, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const rawCode = AuthUtils.generateOtpCode();
  const codeHash = AuthUtils.hashOtp(rawCode);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.otp.create({
    data: {
      identifier,
      codeHash,
      purpose,
      channel: OtpChannel.EMAIL,
      expiresAt,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    },
  });

  await emailQueue.add('send-otp', {
    email: identifier,
    code: rawCode,
    purpose,
  });

  return { success: true, cooldownSeconds: 60 };
};

const verifyOtp = async (identifier: string, purpose: OtpPurpose, code: string) => {
  const record = await prisma.otp.findFirst({
    where: { identifier, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    throw AppError.unauthorized('Verification code expired or not found');
  }

  if (new Date() > record.expiresAt) {
    await prisma.otp.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    throw AppError.unauthorized('Verification code has expired');
  }

  if (record.attempts >= record.maxAttempts) {
    await prisma.otp.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    throw AppError.unauthorized('Too many failed attempts. Request a new code.');
  }

  const isValid = AuthUtils.verifyOtpHash(code, record.codeHash);
  if (!isValid) {
    await prisma.otp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw AppError.unauthorized('Invalid verification code');
  }

  await prisma.otp.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  return true;
};

export const OtpService = {
  sendOtp,
  verifyOtp,
};
