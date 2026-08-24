import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application } from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config';
import { errorHandler } from './middlewares/errorHandler';
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

//global not found middleware (temporary must change in production)
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    data: {
      path: req.originalUrl,
      method: req.method,
      time: new Date().toISOString(),
    },
  });
});

//global error middleware
app.use(errorHandler);

export default app;
