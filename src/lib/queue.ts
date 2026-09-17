import crypto from 'crypto';
import { Queue, Worker } from 'bullmq';

import { isRedisEnabled, redis } from './redis';
import { logger } from './logger';

export type OtpEmailPayload = {
  email: string;
  code: string;
  purpose: 'VERIFY_EMAIL' | 'PASSWORD_RESET' | 'LOGIN';
};

export type PasswordResetEmailPayload = {
  email: string;
  resetToken: string;
};

export type EmailJob =
  | { name: 'send-otp'; data: OtpEmailPayload }
  | { name: 'send-password-reset'; data: PasswordResetEmailPayload };

export type EmailJobHandler = (job: EmailJob) => Promise<void>;

export interface MessageQueue {
  add(job: EmailJob): Promise<void>;
  pendingCount(): Promise<number>;
  process(handler: EmailJobHandler): void;
  close(): Promise<void>;
}

const EMAIL_QUEUE_NAME = 'email-queue';
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 2000;

// ============================================================
// Redis-backed queue (USE_REDIS=true) — BullMQ on shared Redis.
// ============================================================
class RedisMessageQueue implements MessageQueue {
  private queue: Queue;
  private worker?: Worker<EmailJob['data']>;

  constructor(queue: Queue) {
    this.queue = queue;
  }

  async add(job: EmailJob): Promise<void> {
    await this.queue.add(job.name, job.data, {
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_MS },
    });
  }

  process(handler: EmailJobHandler): void {
    if (this.worker || !redis) return;

    this.worker = new Worker<EmailJob['data']>(
      EMAIL_QUEUE_NAME,
      (job) => {
        const emailJob = { name: job.name as EmailJob['name'], data: job.data } as EmailJob;
        return handler(emailJob);
      },
      { connection: redis, concurrency: 5 },
    );

    this.worker.on('failed', (job, err) => {
      if (!job) return;
      logger.error({ err, jobId: job.id }, 'Email job failed');
    });
  }

  async pendingCount(): Promise<number> {
    const counts = await this.queue.getJobCounts();
    return (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0);
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}

// ============================================================
// In-memory fallback queue (USE_REDIS=false). Only safe for a
// single process and offers no persistence; strictly a dev/offline
// mode so the mail flow still works without Redis.
// ============================================================
interface MemoryJob {
  id: string;
  name: EmailJob['name'];
  data: EmailJob['data'];
  attempts: number;
}

class MemoryMessageQueue implements MessageQueue {
  private jobs: MemoryJob[] = [];
  private handler?: EmailJobHandler;
  private draining = false;

  async add(job: EmailJob): Promise<void> {
    this.jobs.push({ id: crypto.randomUUID(), name: job.name, data: job.data, attempts: 0 });
    this.drain();
  }

  process(handler: EmailJobHandler): void {
    this.handler = handler;
    this.drain();
  }

  private drain(): void {
    if (this.draining || !this.handler) return;
    this.draining = true;
    const handler = this.handler;

    void (async () => {
      try {
        while (this.jobs.length > 0) {
          const job = this.jobs.shift();
          if (!job) continue;

          try {
            await handler({ name: job.name, data: job.data } as EmailJob);
          } catch (err) {
            job.attempts += 1;
            logger.error({ err, jobId: job.id, jobName: job.name }, 'Email job failed in-memory');

            if (job.attempts < MAX_ATTEMPTS) {
              // Simple exponential-ish retry; job is re-enqueued after backoff.
              setTimeout(() => {
                this.jobs.push(job);
                this.drain();
              }, BACKOFF_MS * job.attempts);
            }
          }
        }
      } finally {
        this.draining = false;
      }
    })();
  }

  async pendingCount(): Promise<number> {
    return this.jobs.length;
  }

  async close(): Promise<void> {
    this.jobs = [];
    this.handler = undefined;
  }
}

export const emailBullQueue: Queue | null =
  isRedisEnabled() && redis
    ? new Queue(EMAIL_QUEUE_NAME, {
        connection: redis,
        defaultJobOptions: {
          attempts: MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: BACKOFF_MS },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      })
    : null;

export const emailQueue: MessageQueue = emailBullQueue
  ? new RedisMessageQueue(emailBullQueue)
  : new MemoryMessageQueue();

export const startEmailWorker = (handler: EmailJobHandler): void => {
  emailQueue.process(handler);
  logger.info(
    emailBullQueue
      ? 'Email worker started (BullMQ/Redis)'
      : 'Email worker started (in-memory queue — USE_REDIS=false)',
  );
};

export const closeEmailQueue = async (): Promise<void> => {
  await emailQueue.close();
};
