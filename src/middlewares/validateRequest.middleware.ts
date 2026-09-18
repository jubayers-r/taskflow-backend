import { AppError, ValidationErrorDetail } from '@/lib/response/AppError';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, ZodType } from 'zod';

export interface RequestSchema<TBody = unknown, TQuery = unknown, TParams = unknown> {
  body?: ZodType<TBody>;
  query?: ZodType<TQuery>;
  params?: ZodType<TParams>;
}

// Inferred data output type based on the schema definition
export type ValidatedData<T extends RequestSchema> = {
  body: T['body'] extends ZodType<infer B> ? B : undefined;
  query: T['query'] extends ZodType<infer Q> ? Q : undefined;
  params: T['params'] extends ZodType<infer P> ? P : undefined;
};

/**
 * Reads the sanitized/coerced body produced by `validateRequest`. Controllers
 * must use this instead of `req.body` so Zod transforms (trim/lowercase/
 * defaults) and strict-key stripping actually take effect.
 */
export const validatedBody = <T>(req: Request): T => req.validated.body as T;

/**
 * Validates incoming HTTP requests against isolated body, query, and params schemas.
 * Attaches sanitized, coerced output to `req.validated`.
 */
export const validateRequest = <T extends RequestSchema>(schemas: T): RequestHandler => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const errorDetails: ValidationErrorDetail[] = [];
    const validatedOutput: Record<string, unknown> = {};

    const targets: Array<keyof RequestSchema> = ['body', 'query', 'params'];

    for (const target of targets) {
      const schema = schemas[target];
      if (!schema) continue;

      try {
        const result = await schema.parseAsync(req[target]);
        validatedOutput[target] = result;
      } catch (err) {
        if (err instanceof ZodError) {
          for (const issue of err.issues) {
            // Path prefix indicates whether error belongs to body, query, or params
            const path = [target, ...issue.path].join('.');
            errorDetails.push({
              field: path,
              message: issue.message,
              code: issue.code,
            });
          }
        } else {
          return next(err);
        }
      }
    }

    if (errorDetails.length > 0) {
      return next(AppError.unprocessable('Validation failed on incoming request', errorDetails));
    }

    // Persist validated and coerced output for controllers to consume.
    req.validated = validatedOutput as ValidatedData<T>;
    return next();
  };
};
