import crypto from 'crypto';

import { env } from '@/config';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 16;
const AUTH_TAG_LENGTH_BYTES = 16;

const getEncryptionKey = (): Buffer => {
  const keyString = env.CONFIG_ENCRYPTION_KEY;
  if (!keyString) {
    throw new Error('CONFIG_ENCRYPTION_KEY is not set');
  }

  const key = Buffer.from(keyString, 'base64');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `Invalid CONFIG_ENCRYPTION_KEY: expected a base64-encoded 32-byte key, got ${key.length} bytes`,
    );
  }

  return key;
};

export const encrypt = (plaintext: string): string => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
};

export const decrypt = (encryptedData: string): string => {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');
  if (combined.length < IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Invalid encrypted payload');
  }

  const iv = combined.subarray(0, IV_LENGTH_BYTES);
  const authTag = combined.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const ciphertext = combined.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

export const maskSensitiveValue = (value: string): string => {
  if (value.length <= 6) {
    return '****';
  }

  if (value.length <= 12) {
    const visible = Math.floor(value.length / 4);
    return `${value.slice(0, visible)}***${value.slice(-visible)}`;
  }

  return `${value.slice(0, 3)}***${value.slice(-3)}`;
};

export const validateEncryptionKey = (): void => {
  getEncryptionKey();
};
