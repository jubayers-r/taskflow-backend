import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from '@/lib/response/AppError';
import { validatedBody, validateRequest } from '@/middlewares/validateRequest.middleware';

type NextArg = unknown;

const invoke = async (middleware: ReturnType<typeof validateRequest>, req: unknown) => {
  let nextArg: NextArg;
  const next = (err?: unknown) => {
    nextArg = err;
  };
  await middleware(req as never, {} as never, next as never);
  return nextArg;
};

describe('validateRequest', () => {
  it('applies transforms and exposes them via req.validated', async () => {
    const middleware = validateRequest({
      body: z.object({
        email: z.email().trim().toLowerCase(),
        name: z.string().trim(),
      }),
    });
    const req = {
      body: { email: 'User@Example.COM', name: '  Ada  ' },
      validated: undefined,
    } as unknown as { body: unknown; validated?: { body?: unknown } };

    const err = await invoke(middleware, req);

    expect(err).toBeUndefined();
    const validated = validatedBody<{ email: string; name: string }>(req as never);
    expect(validated.email).toBe('user@example.com');
    expect(validated.name).toBe('Ada');
    // Raw body is left untouched; validated is the source of truth.
    expect((req.body as { email: string }).email).toBe('User@Example.COM');
  });

  it('rejects unknown keys for strict schemas', async () => {
    const middleware = validateRequest({ body: z.object({ a: z.string() }).strict() });
    const err = await invoke(middleware, { body: { a: 'x', b: 'nope' } });

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(422);
  });
});
