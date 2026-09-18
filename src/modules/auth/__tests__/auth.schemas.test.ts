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
  it('requires terms acceptance', () => {
    const result = AuthSchema.registerSchema.safeParse({
      email: 'user@example.com',
      password: 'Str0ng!Pass',
      firstName: 'Ada',
      gender: 'FEMALE',
      isAgreeWithTerms: false,
    });
    expect(result.success).toBe(false);
  });
});
