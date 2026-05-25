import { z } from 'zod';

export const TaskStatusSchema = z.enum([
  'queued',
  'script_generating',
  'script_ready',
  'shots_running',
  'stitching',
  'succeeded',
  'failed',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const ShotStatusSchema = z.enum(['pending', 'img_ok', 'video_ok', 'failed']);
export type ShotStatus = z.infer<typeof ShotStatusSchema>;

export const TaskEventSchema = z.object({
  taskId: z.string(),
  status: TaskStatusSchema,
  errorMsg: z.string().optional(),
  shotsTotal: z.number().int().min(0),
  shotsDone: z.number().int().min(0),
  currentStage: z.string().optional(),
  updatedAt: z.string(),
});
export type TaskEvent = z.infer<typeof TaskEventSchema>;

export const TASK_TERMINAL_STATUSES: TaskStatus[] = ['succeeded', 'failed'];
