/**
 * Which database a process talks to.
 *
 * Deliberately dependency-free — no zod, no dotenv, no app secrets — because
 * two very different entry points need to agree on this answer:
 *
 *   - the running application, via `src/config/index.ts`
 *   - the Prisma CLI, via `prisma.config.ts`
 *
 * The Prisma CLI does not import the app config, and must not: running a
 * migration should not require JWT secrets or an OTP pepper. But if these two
 * resolve the database differently, the app can talk to the test branch while
 * `prisma migrate deploy` quietly migrates the developer database. So the rule
 * lives here, in one place, and both import it.
 *
 * `TEST_DATABASE_URL` is test-only and optional: production has no such
 * variable, which is why requiring it anywhere would stop the app booting.
 */
export const resolveDatabaseUrl = (vars: {
  DATABASE_URL: string;
  TEST_DATABASE_URL?: string;
}): string => {
  const testUrl = vars.TEST_DATABASE_URL?.trim();
  // Empty and whitespace-only count as unset. The app's env schema already
  // normalises these away, but this function must be safe for any caller —
  // returning '' here would hand Prisma an empty connection string.
  return testUrl ? testUrl : vars.DATABASE_URL;
};

/** Strips credentials so a database URL is safe to log. */
export const redactUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/${parsed.pathname.replace(/^\//, '')}`;
  } catch {
    return '<unparseable>';
  }
};
