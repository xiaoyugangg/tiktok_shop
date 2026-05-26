import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../env';
import { setTaskStatus, updateShotFromPipeline } from '../task/task.service';
import { addTrace } from '../trace/trace.service';

export const internalRouter: Router = Router();

function assertInternalToken(req: { header(name: string): string | undefined }) {
  const token = req.header('x-internal-token');
  if (token !== env.INTERNAL_CALLBACK_TOKEN) {
    const err = new Error('invalid internal callback token');
    Object.assign(err, { statusCode: 401 });
    throw err;
  }
}

const TraceReqSchema = z.object({
  task_id: z.string(),
  shot_id: z.string().nullable().optional(),
  stage: z.string(),
  level: z.enum(['info', 'warn', 'error']).default('info'),
  message: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

internalRouter.post('/trace', async (req, res, next) => {
  try {
    assertInternalToken(req);
    const body = TraceReqSchema.parse(req.body);
    await addTrace({
      taskId: body.task_id,
      shotId: body.shot_id ?? undefined,
      stage: body.stage,
      level: body.level,
      message: body.message,
      payload: body.payload,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const ShotStatusReqSchema = z.object({
  shot_id: z.string(),
  status: z.enum(['pending', 'img_ok', 'video_ok', 'failed']),
  clip_path: z.string().nullable().optional(),
  error_msg: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  duration_sec: z.number().nullable().optional(),
  retry_count_increment: z.number().int().nonnegative().default(0),
});

internalRouter.post('/shots/status', async (req, res, next) => {
  try {
    assertInternalToken(req);
    const body = ShotStatusReqSchema.parse(req.body);
    await updateShotFromPipeline({
      shotId: body.shot_id,
      status: body.status,
      clipPath: body.clip_path,
      errorMsg: body.error_msg,
      prompt: body.prompt,
      durationSec: body.duration_sec,
      retryCountIncrement: body.retry_count_increment,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const TaskStatusReqSchema = z.object({
  task_id: z.string(),
  status: z.enum([
    'queued',
    'script_generating',
    'script_ready',
    'shots_running',
    'stitching',
    'succeeded',
    'failed',
  ]),
  error_msg: z.string().nullable().optional(),
  output_path: z.string().nullable().optional(),
  stage: z.string().nullable().optional(),
});

internalRouter.post('/tasks/status', async (req, res, next) => {
  try {
    assertInternalToken(req);
    const body = TaskStatusReqSchema.parse(req.body);
    await setTaskStatus({
      taskId: body.task_id,
      status: body.status,
      errorMsg: body.error_msg ?? undefined,
      outputPath: body.output_path ?? undefined,
      stage: body.stage ?? undefined,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
