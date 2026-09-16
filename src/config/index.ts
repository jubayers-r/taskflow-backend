import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Explicitly load this project's .env and let it win over inherited shell values.
loadEnv({ override: true });

const envSchema = z.object({
  PROJECT_NAME: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Redis config
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().min(0).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  USE_REDIS: z.coerce.boolean(),
  REDIS_HOST_DEV: z.string().min(1).default('localhost'),

  ALLOWED_ORIGINS: z.string().transform((val) => val.split(',').map((origin) => origin.trim())),

  // JWT config

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().default('1d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  SALT_ROUNDS: z.coerce.number().int().min(1).default(10),

  // Email config
  EMAIL_FROM: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.issues);
  throw new Error('Invalid environment variables');
}

export const env = _env.data;
