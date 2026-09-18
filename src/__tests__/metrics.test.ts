import request from 'supertest';
import { describe, expect, it } from 'vitest';

import app from '@/app';

describe('metrics endpoint', () => {
  it('exposes the registry in Prometheus text format', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).toContain('taskflow_http_requests_total');
    expect(res.text).toContain('# TYPE');
  });

  it('records a histogram entry for the routes it observes', async () => {
    await request(app).get('/health/live');

    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/taskflow_http_request_duration_seconds_bucket/);
    expect(res.text).toMatch(/taskflow_http_requests_total\{.*route="\/health\/live/);
  });
});
