import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application } from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config';

import { emailQueue } from './lib/queue';
import { errorHandler } from './middlewares/errorHandler.middleware';
import { notFoundHandler } from './middlewares/notFoundHandler.middleware';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import Routes from './routes';

const app: Application = express();
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use('/public', express.static(path.join(process.cwd(), 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestIdMiddleware);
app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));
app.use(helmet());
app.use(cookieParser());

app.use('/api/v1', Routes);
app.use('/admin/queues', serverAdapter.getRouter());

//global API not found middleware
app.use(notFoundHandler);

//global error middleware
app.use(errorHandler);

export default app;
