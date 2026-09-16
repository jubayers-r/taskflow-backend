import { Logger } from 'pino';

export interface ClientMeta {
  ip: string;
  userAgent: string;
}

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      log: Logger;
      clientMeta: ClientMeta;
    }
  }
}

export {};
