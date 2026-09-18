import * as Sentry from '@sentry/bun';

import { env } from '@/config';
import { logger } from './logger';

let enabled = false;

/**
 * Boots Sentry only when SENTRY_DSN is configured, so local/dev runs stay free
 * of external dependencies and tests never emit telemetry.
 */
export const initSentry = (): void => {
  if (!env.SENTRY_DSN) {
    logger.info('Sentry disabled (SENTRY_DSN not set)');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  });

  enabled = true;
  logger.info('Sentry initialized');
};

export const isSentryEnabled = (): boolean => enabled;

/** Best-effort exception capture; a no-op when Sentry is disabled. */
export const captureException = (error: unknown, request?: { path?: string }): void => {
  if (!enabled) return;
  Sentry.captureException(error, request?.path ? { tags: { path: request.path } } : undefined);
};
