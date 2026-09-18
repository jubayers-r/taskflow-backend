import { Logger } from 'pino';

export interface ClientMeta {
  ip: string;
  userAgent: string;
}

export interface AuthenticatedUser {
  userId: string;
  role: string;
  agencyId: string | null;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      log: Logger;
      clientMeta: ClientMeta;
      /** Sanitized/coerced output from `validateRequest`. */
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
      /** Present after `authenticate` succeeds. */
      auth?: AuthenticatedUser;
    }
  }
}

export {};
