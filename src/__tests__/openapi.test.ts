import { beforeAll, describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from '@/lib/openapi';

describe('OpenAPI document', () => {
  let paths: Record<string, unknown> = {};

  beforeAll(async () => {
    // Importing the app registers every documented path (auth + health).
    await import('@/app');
    paths = buildOpenApiDocument().paths as Record<string, unknown>;
  });

  it('generates an OpenAPI 3.1 document', () => {
    const doc = buildOpenApiDocument();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toContain('taskflow');
  });

  it('documents the auth and health endpoints', () => {
    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/login',
        '/api/v1/auth/register',
        '/api/v1/auth/reset-password',
        '/health/live',
        '/health/ready',
      ]),
    );
  });
});
