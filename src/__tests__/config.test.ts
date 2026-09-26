import { envSchema, resolveDatabaseUrl } from '@/config';
import { describe, expect, it, vi } from 'vitest';

const validEnv = {
  PROJECT_NAME: 'test',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pw@main-host/neondb',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'test-access-secret',
  OTP_PEPPER_SECRET: 'test-otp-pepper-secret-at-least-32-characters',
  EMAIL_PROVIDER: 'resend',
  EMAIL_FROM: 'test@example.com',
  RESEND_API_KEY: 're_test_key',
} as Record<string, unknown>;

describe('resolveDatabaseUrl', () => {
  it('prefers TEST_DATABASE_URL over DATABASE_URL when it is set', () => {
    // If this ever regresses, the integration suites write to the developer
    // database. That is the failure this test exists to prevent.
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'postgresql://user:pw@main-host/neondb?sslmode=require',
        TEST_DATABASE_URL: 'postgresql://user:pw@test-host/neondb_test?sslmode=require',
      }),
    ).toBe('postgresql://user:pw@test-host/neondb_test?sslmode=require');
  });

  it('falls back to DATABASE_URL when TEST_DATABASE_URL is absent or empty', () => {
    // This is the production and plain-local-dev case, which is why
    // TEST_DATABASE_URL has to stay optional in the env schema.
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgresql://user:pw@main-host/neondb' })).toBe(
      'postgresql://user:pw@main-host/neondb',
    );
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'postgresql://user:pw@main-host/neondb',
        TEST_DATABASE_URL: '',
      }),
    ).toBe('postgresql://user:pw@main-host/neondb');
  });
});

describe('TEST_DATABASE_URL validation', () => {
  it('accepts being left unset', () => {
    const parsed = envSchema.safeParse({ ...validEnv });
    expect(parsed.success).toBe(true);
  });

  it('treats an empty value as unset instead of crashing the boot', () => {
    // `TEST_DATABASE_URL=` is an easy typo to leave in a .env file. It must not
    // take the whole app down.
    const parsed = envSchema.safeParse({ ...validEnv, TEST_DATABASE_URL: '' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.TEST_DATABASE_URL).toBeUndefined();
    }
  });

  it('accepts a postgres URL', () => {
    const parsed = envSchema.safeParse({
      ...validEnv,
      TEST_DATABASE_URL: 'postgresql://u:p@test-host/neondb_test?sslmode=require',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a non-postgres URL rather than failing later at connect time', () => {
    const parsed = envSchema.safeParse({ ...validEnv, TEST_DATABASE_URL: 'mysql://u:pw@host/db' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'TEST_DATABASE_URL')).toBe(true);
    }
  });
});

describe('prisma.config.ts', () => {
  it('resolves the same database as the app so a migration cannot hit the wrong one', async () => {
    // The CLI does not load `src/config`, so it used to read DATABASE_URL
    // straight out of `.env` while the app used the test branch. The result was
    // `prisma migrate deploy` migrating the developer database. `dotenv/config`
    // does not override existing values, so the stub below survives the import.
    const branchUrl = 'postgresql://u:pw@branch-host/neondb_test?sslmode=require';
    vi.stubEnv('TEST_DATABASE_URL', branchUrl);
    vi.resetModules();

    const config = (await import('../../prisma.config')).default;

    expect(config.datasource?.url).toBe(branchUrl);
    vi.unstubAllEnvs();
  });
});
