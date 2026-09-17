import request from 'supertest';
import { describe, expect, it } from 'vitest';

import app from '@/app';

describe('app', () => {
  it('exposes API discovery at /api/v1', async () => {
    const res = await request(app).get('/api/v1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.apiVersion).toBe('v1');
    expect(res.body.correlationId).toBeTruthy();
  });

  it('returns a unified 404 envelope', async () => {
    const res = await request(app).get('/definitely-not-a-route');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: 'Route not found' });
    expect(res.body.correlationId).toBeTruthy();
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
