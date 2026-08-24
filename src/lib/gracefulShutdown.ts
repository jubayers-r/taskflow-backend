import server from '@/server';
import { logger } from './logger';
import { prisma } from './prisma';

export async function shutdown() {
  logger.info('Shutdown signal received');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
}
