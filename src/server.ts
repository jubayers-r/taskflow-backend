const startTime = performance.now();

import http from 'http';
import app from './app';
import { env } from './config';

import { logger } from './lib/logger';
import { initSentry } from './lib/sentry';
import { validateEncryptionKey } from './lib/crypto';
import { startCleanupJob } from './jobs/cleanup.job';
import { shutdown } from './utils/gracefulShutdown';
import { startEmailWorker } from './workers/email.worker';

initSentry();

// Fail fast when a config encryption key is set but malformed or unusable,
// rather than discovering it on the first decrypt at request time.
if (env.CONFIG_ENCRYPTION_KEY) {
  validateEncryptionKey();
}

const server = http.createServer(app);

server.listen(env.PORT, () => {
  const endTime = performance.now();
  const duration = (endTime - startTime).toFixed(2);
  logger.info(`Server is running on url: http://localhost:${env.PORT} (booted in ${duration}ms)`);

  startEmailWorker();
  startCleanupJob();
});

process.on('SIGTERM', shutdown);

process.on('SIGINT', shutdown);

// A rejected promise or thrown error outside the request lifecycle would
// otherwise crash the process silently. Log fatally and exit gracefully.
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception - shutting down');
  void shutdown();
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection - shutting down');
  void shutdown();
});

export default server;
