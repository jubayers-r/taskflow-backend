import { describe, expect, it } from 'vitest';

import { logger } from '@/lib/logger';
import { getRequestContext, runWithRequestContext } from '@/lib/requestContext';

describe('request context', () => {
  it('is available across async continuations', async () => {
    await runWithRequestContext({ correlationId: 'ctx-1', logger }, async () => {
      await Promise.resolve();
      expect(getRequestContext()?.correlationId).toBe('ctx-1');
    });
  });

  it('is isolated and cleared outside the run scope', () => {
    expect(getRequestContext()).toBeUndefined();
    runWithRequestContext({ correlationId: 'ctx-2', logger }, () => {
      expect(getRequestContext()?.correlationId).toBe('ctx-2');
    });
    expect(getRequestContext()).toBeUndefined();
  });
});
