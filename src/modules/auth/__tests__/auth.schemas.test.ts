import { describe, expect, it } from 'vitest';

import { AuthSchema } from '@/modules/auth/auth.schemas';

describe('AuthSchema.resetPasswordSchema', () => {
  it('rejects a weak new password', () => {
    const result = AuthSchema.resetPasswordSchema.safeParse({ token: 't', newPassword: 'a' });
    expect(result.success).toBe(false);
  });

  it('accepts a password meeting the complexity rules', () => {
    const result = AuthSchema.resetPasswordSchema.safeParse({
      token: 't',
      newPassword: 'Str0ng!Pass',
    });
    expect(result.success).toBe(true);
  });
});

describe('AuthSchema.registerSchema', () => {
  const validBody = {
    email: 'user@example.com',
    password: 'Str0ng!Pass',
    firstName: 'Ada',
    gender: 'FEMALE',
    isAgreeWithTerms: true,
  };

  it('requires terms acceptance', () => {
    const result = AuthSchema.registerSchema.safeParse({ ...validBody, isAgreeWithTerms: false });
    expect(result.success).toBe(false);
  });

  it('accepts a well-formed registration', () => {
    expect(AuthSchema.registerSchema.safeParse(validBody).success).toBe(true);
  });

  it('rejects a client-supplied agencyId instead of stripping it', () => {
    // Regression: `agencyId` used to be accepted here and written straight to the
    // user row, letting anyone register into an existing tenant. The schema is
    // .strict(), so it must now fail loudly rather than silently ignore the key.
    const result = AuthSchema.registerSchema.safeParse({
      ...validBody,
      agencyId: '00000000-0000-0000-0000-000000000001',
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain('agencyId');
  });

  it('cannot smuggle a tenant through any casing or alias of agencyId', () => {
    for (const key of ['agencyid', 'agencyID', 'AgencyId', 'agency_id']) {
      const result = AuthSchema.registerSchema.safeParse({ ...validBody, [key]: 'agency-x' });
      expect(result.success, `${key} must be rejected`).toBe(false);
    }
  });

  it('accepts an agencyName display label', () => {
    const result = AuthSchema.registerSchema.safeParse({ ...validBody, agencyName: 'Ada Studio' });
    expect(result.success).toBe(true);
  });

  it('rejects an over-long agencyName', () => {
    const result = AuthSchema.registerSchema.safeParse({
      ...validBody,
      agencyName: 'x'.repeat(101),
    });
    expect(result.success).toBe(false);
  });
});
