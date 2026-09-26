import request from 'supertest';
import { describe, expect, it } from 'vitest';

import app from '@/app';

describe('app', () => {
  it('exposes service metadata at /api/v1', async () => {
    const res = await request(app).get('/api/v1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.apiVersion).toBe('v1');
    expect(res.body.data.docs).toBe('/docs');
    expect(res.body.correlationId).toBeTruthy();
  });

  it('returns a unified 404 envelope', async () => {
    const res = await request(app).get('/definitely-not-a-route');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: 'Route not found' });
    expect(res.body.correlationId).toBeTruthy();
  });

  it('points at the docs from a 404 without redirecting to them', async () => {
    // A 302 would resolve a typo'd path to 200 + HTML, so a client error would
    // look like success. The 404 must stay a 404; only the pointer is added.
    const res = await request(app).get('/api/v1/nope');

    expect(res.status).toBe(404);
    expect(res.body.docs).toBe('/docs');
    expect(res.body.openapi).toBe('/openapi.json');
    expect(res.headers['link']).toContain('/docs');
    expect(res.body.data.path).toBe('/api/v1/nope');
  });

  it('404s a resource collection root now that it has no index route', async () => {
    // Deliberate: the collection index routes were hand-written route tables
    // that drifted. /api/v1 and /openapi.json are the discovery surfaces.
    for (const path of ['/api/v1/auth', '/api/v1/users']) {
      const res = await request(app).get(path);
      expect(res.status, `${path} should 404`).toBe(404);
      expect(res.body.message).toBe('Route not found');
    }
  });

  it('reports liveness without touching dependencies', async () => {
    const res = await request(app).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'ok' });
  });

  it('sets rate limit headers on the API surface', async () => {
    const res = await request(app).get('/api/v1');

    expect(res.headers['ratelimit-limit']).toBeDefined();
  });

  it('rejects a weak password on reset with the validation envelope', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'abc', newPassword: 'weak' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeInstanceOf(Array);
    expect(res.body.correlationId).toBeTruthy();
  });

  it('serves the OpenAPI document and the Scalar docs UI', async () => {
    const spec = await request(app).get('/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');

    const docs = await request(app).get('/docs');
    expect(docs.status).toBe(200);
    expect(docs.headers['content-type']).toContain('text/html');
    // Scalar's CDN bundle and inline init script must survive the helmet CSP.
    expect(docs.headers['content-security-policy']).toContain('https://cdn.jsdelivr.net');
    expect(docs.headers['content-security-policy']).toContain("'unsafe-inline'");
  });
});
