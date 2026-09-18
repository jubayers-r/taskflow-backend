import { describe } from 'vitest';

/**
 * Integration suites need a real, migrated Postgres. They run when
 * TEST_DATABASE_URL is provided (CI), and are skipped otherwise so local unit
 * runs stay fast and hermetic.
 */
export const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);

export const describeIntegration = hasTestDatabase ? describe : describe.skip;
