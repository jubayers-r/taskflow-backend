import { env } from '@/config';
import pino from 'pino';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  base: { service: 'taskflow' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: [
    // Headers & Auth
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',

    // Passwords & Hashes
    '*.password',
    '*.passwordHash',
    '*.confirmPassword',

    // Tokens & Sessions
    '*.token',
    '*.tokenHash',
    '*.refreshToken',
    '*.accessToken',
    '*.fcmToken',

    // OTP & Verification
    '*.code',
    '*.codeHash',
    '*.otp',

    // Sensitive Payment & Billing
    '*.rawResponse',
    '*.secret',
  ],
  formatters: {
    level: (label) => ({ level: label }),
  },
});
