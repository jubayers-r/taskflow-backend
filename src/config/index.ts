import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Explicitly load this project's .env and let it win over inherited shell values.
loadEnv({ override: true });

const envSchema = z
  .object({
    PROJECT_NAME: z.string().min(1),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('5000'),
    DATABASE_URL: z.string().min(1),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    // Number of trusted reverse-proxy hops used to resolve the real client IP.
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),

    // Redis config
    // USE_REDIS=true  -> Redis-backed queue, rate limiter & cache
    // USE_REDIS=false -> In-memory fallbacks (no Redis connection created)
    USE_REDIS: z
      .preprocess(
        (val) => (typeof val === 'string' ? val.toLowerCase() === 'true' : val),
        z.boolean(),
      )
      .default(false),
    REDIS_HOST: z.string().min(1).optional(),
    REDIS_PORT: z.coerce.number().int().min(0).max(65535).default(6379),
    REDIS_PASSWORD: z.string().optional(),

    ALLOWED_ORIGINS: z.string().transform((val) => val.split(',').map((origin) => origin.trim())),

    // JWT config

    JWT_ACCESS_SECRET: z.string().min(1),
    JWT_REFRESH_SECRET: z.string().min(1),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    SALT_ROUNDS: z.coerce.number().int().min(1).default(12),

    // OTP
    OTP_PEPPER_SECRET: z.string().min(32, 'OTP_PEPPER_SECRET must be at least 32 characters'),

    // Email config
    EMAIL_PROVIDER: z.enum(['gmail', 'resend']).default('gmail'),
    EMAIL_FROM: z.email().trim(),
    RESEND_API_KEY: z.string().min(1).optional(),
    GMAIL_APP_PASSWORD: z.string().min(16).optional(),
  })

  // SuperRefine: Enforce conditional email provider config
  .superRefine((data, ctx) => {
    if (data.USE_REDIS && !data.REDIS_HOST) {
      ctx.addIssue({
        code: 'custom',
        message: 'REDIS_HOST is required when USE_REDIS is enabled',
        path: ['REDIS_HOST'],
      });
    }

    if (data.EMAIL_PROVIDER === 'gmail' && !data.GMAIL_APP_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        message:
          'GMAIL_APP_PASSWORD is required and must be at least 16 characters when EMAIL_PROVIDER is "gmail"',
        path: ['GMAIL_APP_PASSWORD'],
      });
    }

    if (data.EMAIL_PROVIDER === 'resend' && !data.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER is "resend"',
        path: ['RESEND_API_KEY'],
      });
    }
  });

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.issues);
  throw new Error('Invalid environment variables');
}

export const env = _env.data;
