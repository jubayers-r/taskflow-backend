import { AsyncLocalStorage } from 'node:async_hooks';
import type { Logger } from 'pino';

/**
 * Per-request context propagated via AsyncLocalStorage so that services and
 * repositories can access the correlation id, logger, and (once authenticated)
 * the current user without threading them through every function signature.
 */
export interface RequestContext {
  correlationId: string;
  logger: Logger;
  user?: {
    id: string;
    role: string;
    agencyId: string | null;
    sessionId: string;
  };
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(context: RequestContext, callback: () => T): T =>
  storage.run(context, callback);

export const getRequestContext = (): RequestContext | undefined => storage.getStore();
