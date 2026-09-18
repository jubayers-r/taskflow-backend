import { describe, expect, it } from 'vitest';

import { captureException, initSentry, isSentryEnabled } from '@/lib/sentry';

describe('sentry integration', () => {
  it('stays disabled when no DSN is configured', () => {
    initSentry();
    expect(isSentryEnabled()).toBe(false);
  });

  it('captureException is a safe no-op when disabled', () => {
    expect(() => captureException(new Error('boom'), { path: '/x' })).not.toThrow();
  });
});
