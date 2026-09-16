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

// Strongly-typed request handler helper for controllers
export type ValidatedRequestHandler<T extends RequestSchema> = (
  req: Request,
  res: Response<unknown, { validated: ValidatedData<T> }>,
  next: NextFunction,
) => void | Promise<void>;

/**
 * Validates incoming HTTP requests against isolated body, query, and params schemas.
 * Attaches sanitized, coerced output to `res.locals.validated`.
 */
export const validateRequest = <T extends RequestSchema>(schemas: T): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errorDetails: ValidationErrorDetail[] = [];
    const validatedOutput: Partial<ValidatedData<T>> = {};

    const targets: Array<keyof RequestSchema> = ['body', 'query', 'params'];

    for (const target of targets) {
      const schema = schemas[target];
      if (!schema) continue;

      try {
        const result = await schema.parseAsync(req[target]);
        validatedOutput[target as keyof ValidatedData<T>] = result as any;
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

    // Persist validated and coerced output without mutating Express internal structures
    res.locals.validated = validatedOutput as ValidatedData<T>;
    return next();
  };
};
