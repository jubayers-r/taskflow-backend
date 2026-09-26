import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Explicitly load this project's .env and let it win over inherited shell values.
loadEnv({ override: true });

export const envSchema = z
  .object({
    PROJECT_NAME: z.string().min(1),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('5000'),
    DATABASE_URL: z.string().min(1),
    // Test-only, and optional on purpose: production has no such variable, so
    // requiring it would stop the app from booting. When it *is* present this
    // becomes the database the process actually talks to (resolveDatabaseUrl
    // below). An empty value is treated as unset, because `TEST_DATABASE_URL=`
    // in a .env file is a common accident and should not crash the boot.
    TEST_DATABASE_URL: z.preprocess(
      (val) => (val === '' ? undefined : val),
      z
        .string()
        .regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string')
        .optional(),
    ),
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
    // Durations follow jose's timespan format ("15m", "2h", "30d") so a bad
    // value fails at boot instead of when signing tokens. Bare seconds are
    // also accepted for legacy env files.
    JWT_ACCESS_SECRET: z.string().min(1),
    JWT_ACCESS_EXPIRES_IN: z
      .string()
      .regex(/^(?:\d+[smhd]|\d+)$/, 'must be a timespan like "15m", "2h", "30d", or seconds')
      .default('15m'),
    SALT_ROUNDS: z.coerce.number().int().min(1).default(12),

    // OTP
    OTP_PEPPER_SECRET: z.string().min(32, 'OTP_PEPPER_SECRET must be at least 32 characters'),

    // Auth session / lockout policy
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).default(7),
    SESSION_SHORT_TTL_DAYS: z.coerce.number().int().min(1).default(1),
    SESSION_LONG_TTL_DAYS: z.coerce.number().int().min(1).default(30),
    LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    LOCKOUT_DURATION_MINUTES: z.coerce.number().int().min(1).default(15),

    // Sentry (error tracking) — optional; disabled when no DSN is configured.
    SENTRY_DSN: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

    // AES-256-GCM key (base64-encoded 32 bytes) for encrypting sensitive
    // configuration values at rest. Required in production; validated at boot.
    CONFIG_ENCRYPTION_KEY: z.string().optional(),

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

    if (data.NODE_ENV === 'production' && !data.CONFIG_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: 'custom',
        message:
          'CONFIG_ENCRYPTION_KEY is required in production (base64-encoded 32-byte AES-256-GCM key)',
        path: ['CONFIG_ENCRYPTION_KEY'],
      });
    }
  });

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.issues);
  throw new Error('Invalid environment variables');
}

/**
 * Chooses which database this process talks to.
 *
 * This lives here, and not in the test setup file, on purpose. Config calls
 * `loadEnv({ override: true })`, so anything that mutates `process.env` *before*
 * config is imported gets silently reverted by the project's own `.env`. An
 * earlier version of the test setup redirected `process.env.DATABASE_URL` from
 * this function's perspective only; `loadEnv` then overwrote it, and the
 * integration suites quietly pointed at the developer database instead of the
 * test branch. Resolving after the parse makes the rule independent of module
 * evaluation order, of which process manager launched the tests, and of whether
 * a `.env` file happens to exist.
 */
export const resolveDatabaseUrl = (vars: {
  DATABASE_URL: string;
  TEST_DATABASE_URL?: string;
}): string => {
  const testUrl = vars.TEST_DATABASE_URL?.trim();
  // Empty and whitespace-only count as unset. The schema already normalises
  // these away, but this function must be safe for any caller, and returning ''
  // here would mean a Prisma client built with an empty connection string.
  return testUrl ? testUrl : vars.DATABASE_URL;
};

/** Strips credentials so a database URL is safe to log. */
const redactUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/${parsed.pathname.replace(/^\//, '')}`;
  } catch {
    return '<unparseable>';
  }
};

const resolvedDatabaseUrl = resolveDatabaseUrl(_env.data);

if (_env.data.TEST_DATABASE_URL) {
  // Loud, because this also redirects `bun run dev` and the dev server. Set it
  // deliberately, and point it at a throwaway database.
  console.warn(
    `⚠️  TEST_DATABASE_URL is set — using the test database ${redactUrl(resolvedDatabaseUrl)} ` +
      `instead of ${redactUrl(_env.data.DATABASE_URL)}. Never point this at a real database.`,
  );
}

export const env = { ..._env.data, DATABASE_URL: resolvedDatabaseUrl };
