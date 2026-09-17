import { NextFunction, Request, Response } from 'express';

export function attachClientMeta(req: Request, _res: Response, next: NextFunction) {
  // With `trust proxy` configured, req.ip already reflects the real client
  // address from X-Forwarded-For without blindly trusting the header.
  req.clientMeta = {
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    userAgent: req.get('user-agent') ?? 'unknown',
  };
  next();
}
