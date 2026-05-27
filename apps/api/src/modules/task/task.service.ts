import path from 'node:path';

import { prisma } from '../../lib/prisma';
import { publicUrlForRelative } from '../../lib/storage';

import { taskEvents } from './events';

import type {
  Ratio,
  Script,
  ShotDto,
  ShotStatus,
  TaskDto,
  TaskStatus,
  UpdateShotReq,
} from '@tiktop/shared';

export async function createTask(args: {
  scriptId: string;
  ratio: Ratio;
  editingPlanId?: string;
}): Promise<{ taskId: string; script: Script }> {
  const script = await prisma.script.findUnique({ where: { id: args.scriptId } });
  if (!script) throw new Error(`script ${args.scriptId} not found`);
  const payload = JSON.parse(script.payload) as Script;
  const editingPlan = args.editingPlanId
    ? await prisma.editingPlan.findFirst({
        where: { id: args.editingPlanId, scriptId: script.id },
      })
    : null;
  if (args.editingPlanId && !editingPlan) {
    throw new Error(`editing plan ${args.editingPlanId} not found for script ${script.id}`);
  }
  const plannedByIdx = new Map<
    number,
    {
      prompt: string;
      subtitle: string;
      bgmHint: string;
      durationSec: number;
      sourceMaterialId?: string | null;
    }
  >();
  if (editingPlan) {
    const parsed = JSON.parse(editingPlan.payloadJson) as {
      shots: Array<{
        idx: number;
        prompt: string;
        subtitle: string;
        bgmHint: string;
        durationSec: number;
        sourceMaterialId?: string | null;
      }>;
    };
    for (const shot of parsed.shots) {
      plannedByIdx.set(shot.idx, shot);
    }
  }

  const taskId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.videoTask.create({
    data: {
      id: taskId,
      productId: script.productId,
      scriptId: script.id,
      ratio: args.ratio,
      status: 'queued',
    },
  });
  await prisma.shot.createMany({
    data: payload.shots.map((shot) => {
      const planned = plannedByIdx.get(shot.idx);
      return {
        id: `sh_${taskId.slice(2)}_${shot.idx}`,
        taskId,
        idx: shot.idx,
        description: shot.description,
        cameraMotion: shot.cameraMotion ?? '',
        durationSec: planned?.durationSec ?? shot.durationSec,
        prompt: planned?.prompt ?? null,
        subtitle: planned?.subtitle ?? shot.subtitle ?? null,
        bgmHint: planned?.bgmHint ?? shot.bgmHint ?? null,
        sourceMaterialId: planned?.sourceMaterialId ?? null,
        status: 'pending',
      };
    }),
  });

  emitTaskEvent(taskId, 'queued', { shotsTotal: payload.shots.length, shotsDone: 0 });
  return { taskId, script: payload };
}

export async function getTaskDto(taskId: string): Promise<TaskDto | null> {
  const record = await prisma.videoTask.findUnique({
    where: { id: taskId },
    include: { shots: { orderBy: { idx: 'asc' } } },
  });
  if (!record) return null;
  return toTaskDto(record);
}

export async function setTaskStatus(args: {
  taskId: string;
  status: TaskStatus;
  errorMsg?: string;
  outputPath?: string;
  stage?: string;
}): Promise<void> {
  await prisma.videoTask.update({
    where: { id: args.taskId },
    data: {
      status: args.status,
      errorMsg: args.errorMsg ?? undefined,
      outputPath: args.outputPath ?? undefined,
    },
  });
  const shotsTotal = await prisma.shot.count({ where: { taskId: args.taskId } });
  const shotsDone = await prisma.shot.count({
    where: { taskId: args.taskId, status: 'video_ok' },
  });
  emitTaskEvent(args.taskId, args.status, {
    shotsTotal,
    shotsDone,
    errorMsg: args.errorMsg,
    stage: args.stage,
  });
}

export async function updateShot(
  taskId: string,
  shotId: string,
  patch: UpdateShotReq,
): Promise<TaskDto | null> {
  const shot = await prisma.shot.findFirst({ where: { id: shotId, taskId } });
  if (!shot) return null;

  await prisma.shot.update({
    where: { id: shot.id },
    data: {
      description: patch.description,
      cameraMotion: patch.cameraMotion,
      prompt: patch.prompt,
      subtitle: patch.subtitle,
      bgmHint: patch.bgmHint,
      durationSec: patch.durationSec,
      sourceMaterialId: patch.sourceMaterialId,
    },
  });

  return getTaskDto(taskId);
}

export async function setShotStatus(args: {
  shotId: string;
  status: ShotStatus;
  imagePath?: string;
  clipPath?: string;
  errorMsg?: string;
}): Promise<void> {
  const shot = await prisma.shot.update({
    where: { id: args.shotId },
    data: {
      status: args.status,
      imagePath: args.imagePath ?? undefined,
      clipPath: args.clipPath ?? undefined,
      errorMsg: args.errorMsg ?? (args.status === 'video_ok' ? null : undefined),
    },
  });
  const task = await prisma.videoTask.findUnique({ where: { id: shot.taskId } });
  if (!task) return;
  const shotsTotal = await prisma.shot.count({ where: { taskId: shot.taskId } });
  const shotsDone = await prisma.shot.count({
    where: { taskId: shot.taskId, status: 'video_ok' },
  });
  emitTaskEvent(task.id, task.status as TaskStatus, {
    shotsTotal,
    shotsDone,
    stage: `shot ${shot.idx + 1} -> ${args.status}`,
  });
}

export async function updateShotFromPipeline(args: {
  shotId: string;
  status: ShotStatus;
  clipPath?: string | null;
  errorMsg?: string | null;
  prompt?: string | null;
  durationSec?: number | null;
  retryCountIncrement?: number;
}): Promise<void> {
  const shot = await prisma.shot.update({
    where: { id: args.shotId },
    data: {
      status: args.status,
      clipPath: args.clipPath ?? undefined,
      errorMsg: args.errorMsg ?? (args.status === 'video_ok' ? null : undefined),
      prompt: args.prompt ?? undefined,
      durationSec: args.durationSec ?? undefined,
      retryCount: args.retryCountIncrement ? { increment: args.retryCountIncrement } : undefined,
    },
  });
  const task = await prisma.videoTask.findUnique({ where: { id: shot.taskId } });
  if (!task) return;
  const shotsTotal = await prisma.shot.count({ where: { taskId: shot.taskId } });
  const shotsDone = await prisma.shot.count({
    where: { taskId: shot.taskId, status: 'video_ok' },
  });
  emitTaskEvent(task.id, task.status as TaskStatus, {
    shotsTotal,
    shotsDone,
    stage: `shot ${shot.idx + 1} -> ${args.status}`,
  });
}

function emitTaskEvent(
  taskId: string,
  status: TaskStatus,
  extra: { shotsTotal: number; shotsDone: number; errorMsg?: string; stage?: string },
) {
  taskEvents.emitTaskEvent({
    taskId,
    status,
    shotsTotal: extra.shotsTotal,
    shotsDone: extra.shotsDone,
    errorMsg: extra.errorMsg,
    currentStage: extra.stage,
    updatedAt: new Date().toISOString(),
  });
}

function toTaskDto(record: {
  id: string;
  productId: string;
  scriptId: string;
  ratio: string;
  status: string;
  errorMsg: string | null;
  outputPath: string | null;
  createdAt: Date;
  updatedAt: Date;
  shots: Array<{
    id: string;
    idx: number;
    description: string;
    cameraMotion: string;
    durationSec: number;
    prompt: string | null;
    subtitle: string | null;
    bgmHint: string | null;
    sourceMaterialId: string | null;
    retryCount: number;
    status: string;
    imagePath: string | null;
    clipPath: string | null;
    errorMsg: string | null;
  }>;
}): TaskDto {
  const shots: ShotDto[] = record.shots.map((s) => ({
    id: s.id,
    idx: s.idx,
    description: s.description,
    cameraMotion: s.cameraMotion,
    durationSec: s.durationSec,
    prompt: s.prompt,
    subtitle: s.subtitle,
    bgmHint: s.bgmHint,
    sourceMaterialId: s.sourceMaterialId,
    retryCount: s.retryCount,
    status: (s.status as ShotStatus) ?? 'pending',
    imageUrl: s.imagePath ? publicUrlForRelative(s.imagePath) : null,
    clipUrl: s.clipPath ? publicUrlForRelative(s.clipPath) : null,
    errorMsg: s.errorMsg,
  }));
  return {
    id: record.id,
    productId: record.productId,
    scriptId: record.scriptId,
    ratio: record.ratio as Ratio,
    status: (record.status as TaskStatus) ?? 'queued',
    errorMsg: record.errorMsg,
    outputUrl: record.outputPath
      ? publicUrlForRelative(record.outputPath.split(path.sep).join('/'))
      : null,
    shots,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
