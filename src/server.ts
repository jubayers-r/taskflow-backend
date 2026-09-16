const startTime = performance.now();

import http from 'http';
import app from './app';
import { env } from './config';

import { logger } from './lib/logger';
import { shutdown } from './utils/gracefulShutdown';

const server = http.createServer(app);

server.listen(env.PORT, async () => {
  const endTime = performance.now();
  const duration = (endTime - startTime).toFixed(2);
  logger.info(`Server is running on url: http://localhost:${env.PORT} (booted in ${duration}ms)`);
});

process.on('SIGTERM', shutdown);

process.on('SIGINT', shutdown);

export default server;
