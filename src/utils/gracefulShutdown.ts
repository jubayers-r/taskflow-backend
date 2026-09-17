import { logger } from '@/lib/logger';
import { closeEmailQueue } from '@/lib/queue';
import { prisma } from '@/lib/prisma';
import { isRedisEnabled, redis } from '@/lib/redis';
import server from '@/server';

export async function shutdown() {
  logger.info('Shutdown signal received');
  server.close(async () => {
    await closeEmailQueue();
    await prisma.$disconnect();

    if (isRedisEnabled() && redis) {
      redis.disconnect();
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
}
