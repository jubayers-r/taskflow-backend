import { describe, expect, it } from 'vitest';

import { decrypt, encrypt, maskSensitiveValue, validateEncryptionKey } from '@/lib/crypto';

describe('crypto', () => {
  describe('encrypt/decrypt', () => {
    it('round-trips arbitrary plaintext', () => {
      const plaintext = 'smtp://user:secret@host:587?tls=true';
      const encrypted = encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('produces unique ciphertext per encryption (random IV)', () => {
      expect(encrypt('same-value')).not.toBe(encrypt('same-value'));
    });

    it('throws for garbled encrypted payloads', () => {
      expect(() => decrypt('not-base64!')).toThrow();
      expect(() => decrypt(Buffer.alloc(8).toString('base64'))).toThrow(
        /Invalid encrypted payload/,
      );
    });

    it('fails to decrypt when the ciphertext is tampered with (auth tag)', () => {
      const encrypted = encrypt('integrity-check');
      const combined = Buffer.from(encrypted, 'base64');
      combined[combined.length - 1] = (combined[combined.length - 1] ?? 0) ^ 0xff;
      expect(() => decrypt(combined.toString('base64'))).toThrow();
    });
  });

  describe('maskSensitiveValue', () => {
    it('masks short values entirely', () => {
      expect(maskSensitiveValue('ab')).toBe('****');
      expect(maskSensitiveValue('abcdef')).toBe('****');
    });

    it('keeps a quarter visible on each side for medium values', () => {
      expect(maskSensitiveValue('12345678')).toBe('12***78');
    });

    it('keeps three characters visible on each side for long values', () => {
      expect(maskSensitiveValue('abcdefghijklmnopqrstuvwxyz')).toBe('abc***xyz');
    });
  });

  describe('validateEncryptionKey', () => {
    it('accepts the test environment key (base64 32-byte)', () => {
      expect(() => validateEncryptionKey()).not.toThrow();
    });
  });
});
