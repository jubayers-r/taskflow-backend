import request from 'supertest';
import { describe, expect, it } from 'vitest';

import app from '@/app';
import { ErrorCode } from '@/lib/response/AppError';

describe('error handling', () => {
  it('returns a coded 404 envelope for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: ErrorCode.NOT_FOUND });
  });

  it('returns a coded 400 envelope for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: ErrorCode.BAD_REQUEST });
  });

  it('returns a coded 422 envelope with field details for validation errors', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 't', newPassword: 'weak' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(res.body.errors[0].field).toBe('body.newPassword');
  });
});
