import path from 'node:path';

import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';

import { env } from './env';
import { logger } from './lib/logger';
import { STORAGE_ROOT } from './lib/storage';
import { agentRouter } from './modules/agent/agent.router';
import { analyticsRouter } from './modules/analytics/analytics.router';
import { internalRouter } from './modules/internal/internal.router';
import { materialRouter } from './modules/material/material.router';
import { productRouter } from './modules/product/product.router';
import { scriptRouter } from './modules/script/script.router';
import { taskRouter } from './modules/task/task.router';
import { traceRouter } from './modules/trace/trace.router';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.use(
    '/static',
    express.static(STORAGE_ROOT, {
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      modelMode: env.MODEL_MODE,
      storageRoot: path.basename(STORAGE_ROOT),
      version: '0.1.0',
    });
  });

  app.use('/api/agent', agentRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/internal', internalRouter);
  app.use('/api/materials', materialRouter);
  app.use('/api/products', productRouter);
  app.use('/api/scripts', scriptRouter);
  app.use('/api/tasks', taskRouter);
  app.use('/api', traceRouter);

  app.use((req, res) => {
    res.status(404).json({ message: `route ${req.path} not found` });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled error');
    const message = err instanceof Error ? err.message : 'internal error';
    const statusCode =
      typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      typeof err.statusCode === 'number'
        ? err.statusCode
        : 500;
    res.status(statusCode).json({ message });
  });

  return app;
}
