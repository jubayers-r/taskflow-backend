import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodObject } from 'zod';

export function validate(schema: ZodObject<any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(422).json({
          error: 'Validation failed',
          issues: err.issues.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
          requestId: res.locals.requestId,
        });
        return;
      }
      next(err);
    }
  };
}
