import { logger } from '../../lib/logger';

import { taskEvents } from './events';

import type { TaskEvent } from '@tiktop/shared';
import type { Request, Response } from 'express';

export function handleTaskSse(req: Request, res: Response, taskId: string) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ taskId })}\n\n`);

  const onEvent = (event: TaskEvent) => {
    res.write(`event: task\ndata: ${JSON.stringify(event)}\n\n`);
  };

  taskEvents.on(taskId, onEvent);

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    taskEvents.off(taskId, onEvent);
    logger.debug({ taskId }, 'sse client closed');
  });
}
