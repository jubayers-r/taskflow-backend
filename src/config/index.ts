import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Explicitly load this project's .env and let it win over inherited shell values.
loadEnv({ override: true });

const envSchema = z.object({
  PROJECT_NAME: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  DATABASE_URL: z.string().min(1),

  // Redis config
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().min(0).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  USE_REDIS: z.coerce.boolean(),
  REDIS_HOST_DEV: z.string().min(1).default('localhost'),

  ALLOWED_ORIGINS: z.string().transform((val) => val.split(',').map((origin) => origin.trim())),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.issues);
  throw new Error('Invalid environment variables');
}

export const env = _env.data;
