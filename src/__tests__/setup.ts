// Sets a valid environment before any module (notably `@/config`) is imported.
// In CI there is no `.env`, so these values apply; locally `dotenv` may override
// them with the developer's `.env`, which is fine for smoke tests.
process.env.NODE_ENV = 'test';
process.env.PROJECT_NAME = 'taskflow-backend-test';
process.env.PORT = '5000';
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/taskflow_test?schema=public';

// Integration suites (e.g. in CI) point DATABASE_URL at a real, migrated test
// database so app code and Prisma connect to the same target as the tests.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.LOG_LEVEL = 'error';
process.env.TRUST_PROXY = '0';
process.env.USE_REDIS = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.SALT_ROUNDS = '4';
process.env.OTP_PEPPER_SECRET = 'test-otp-pepper-secret-at-least-32-characters';
process.env.EMAIL_PROVIDER = 'gmail';
process.env.EMAIL_FROM = 'test@example.com';
process.env.GMAIL_APP_PASSWORD = 'dummy-gmail-app-password';
process.env.CONFIG_ENCRYPTION_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
