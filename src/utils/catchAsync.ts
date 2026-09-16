import { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (
  req: Request<any, any, any, any>,
  res: Response,
  next: NextFunction,
) => Promise<any>;

/**
 * Higher-order function that catches rejections in async routes
 * and forwards them to Express's global error middleware.
 */
export const catchAsync = (fn: AsyncRequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

export default catchAsync;
