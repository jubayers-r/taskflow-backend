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
  redact: ['req.headers.authorization', 'password', 'token', 'secret'],
  formatters: {
    level: (label) => ({ level: label }),
  },
});
