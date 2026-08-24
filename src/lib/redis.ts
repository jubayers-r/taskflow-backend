import { env } from '@/config';
import { Redis } from 'ioredis';

let errorCount = 0;
const MAX_LOGS = 5;

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    // Keeps it from slamming the server instantly if connection drops
    return Math.min(times * 1000, 5000);
  },
});

redis.on('error', (err) => {
  if (errorCount < MAX_LOGS) {
    if (err.message.includes('NOAUTH')) {
      console.error('❌ REDIS AUTH ERROR: Authentication required. Check your REDIS_URL password.');
    } else {
      console.error(`❌ REDIS ERROR: ${err.message}`);
    }
    errorCount++;
    if (errorCount === MAX_LOGS) {
      console.warn('⚠️ REDIS LOG LIMIT: Silencing errors. Verify your credentials!');
    }
  }
});

// 'ready' only fires AFTER successful authentication
redis.on('ready', () => {
  errorCount = 0;
  console.log('✅ Redis connected and authenticated!');
});
