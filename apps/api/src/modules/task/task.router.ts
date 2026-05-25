import path from 'node:path';

import { CreateTaskReqSchema } from '@tiktop/shared';
import { Router } from 'express';

import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { STORAGE_ROOT } from '../../lib/storage';
import { runPipeline } from '../creation/pipeline';

import { handleTaskSse } from './sse';
import { createTask, getTaskDto, setTaskStatus } from './task.service';

export const taskRouter: Router = Router();

taskRouter.post('/', async (req, res, next) => {
  try {
    const parsed = CreateTaskReqSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'invalid request', issues: parsed.error.issues });
      return;
    }
    const { taskId, script } = await createTask(parsed.data);
    setImmediate(async () => {
      try {
        await setTaskStatus({ taskId, status: 'script_ready', stage: '剧本准备完成' });
        await runPipeline({ taskId, script, ratio: parsed.data.ratio });
      } catch (err) {
        logger.error({ err, taskId }, 'pipeline crashed');
        await setTaskStatus({
          taskId,
          status: 'failed',
          errorMsg: err instanceof Error ? err.message : String(err),
        });
      }
    });
    const dto = await getTaskDto(taskId);
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
});

taskRouter.get('/:id', async (req, res, next) => {
  try {
    const dto = await getTaskDto(req.params.id);
    if (!dto) {
      res.status(404).json({ message: 'task not found' });
      return;
    }
    res.json(dto);
  } catch (err) {
    next(err);
  }
});

taskRouter.get('/:id/events', (req, res) => {
  handleTaskSse(req, res, req.params.id);
});

taskRouter.get('/:id/output', async (req, res, next) => {
  try {
    const record = await prisma.videoTask.findUnique({ where: { id: req.params.id } });
    if (!record?.outputPath) {
      res.status(404).json({ message: 'output not ready' });
      return;
    }
    const abs = path.join(STORAGE_ROOT, record.outputPath);
    res.download(abs, `tiktop_${record.id}.mp4`);
  } catch (err) {
    next(err);
  }
});
