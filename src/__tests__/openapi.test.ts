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

  it('declares a bearer security scheme and applies it to protected routes', () => {
    const doc = buildOpenApiDocument() as unknown as {
      components?: { securitySchemes?: Record<string, unknown> };
      paths: Record<string, Record<string, { security?: unknown }>>;
    };

    expect(doc.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(doc.paths['/api/v1/auth/me']?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.paths['/api/v1/auth/login']?.post?.security).toBeUndefined();
  });
});
