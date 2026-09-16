import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import server from '@/server';

export async function shutdown() {
  logger.info('Shutdown signal received');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
}
