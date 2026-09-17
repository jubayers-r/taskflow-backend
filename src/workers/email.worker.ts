import { startEmailWorker as startQueueWorker } from '@/lib/queue';
import { processEmailJob } from '@/services/email.service';

export const startEmailWorker = (): void => {
  startQueueWorker(processEmailJob);
};
