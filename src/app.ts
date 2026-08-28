import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application } from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config';

import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFoundHandler';
import { requestIdMiddleware } from './middlewares/requestId';
import Routes from './routes';

const app: Application = express();

app.use('/public', express.static(path.join(process.cwd(), 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestIdMiddleware);
app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));
app.use(helmet());
app.use(cookieParser());

app.use('/api/v1', Routes);

//global API not found middleware
app.use(notFoundHandler);

//global error middleware
app.use(errorHandler);

export default app;
