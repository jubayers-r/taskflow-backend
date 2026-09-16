import { NextFunction, Request, Response } from 'express';

export function attachClientMeta(req: Request, _res: Response, next: NextFunction) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]!.trim()
      : req.ip || req.socket.remoteAddress || 'unknown';

  const userAgent = (req.headers['user-agent'] as string) || 'unknown';

  req.clientMeta = { ip, userAgent };
  next();
}
