import path from 'node:path';

import { env } from '../../env';
import { callAgent, type PipelineRunResponse } from '../../lib/agentClient';
import { prisma } from '../../lib/prisma';
import { STORAGE_ROOT } from '../../lib/storage';

import type { Ratio } from '@tiktop/shared';

export async function runPythonPipeline(args: { taskId: string; ratio: Ratio }): Promise<void> {
  const payload = await buildPythonPipelinePayload(args.taskId, args.ratio);
  const response = await callAgent<PipelineRunResponse>('/pipeline/run', payload, {
    signal: AbortSignal.timeout(env.ARK_VIDEO_POLL_TIMEOUT_MS + 120_000),
  });

  if (response.status === 'failed') {
    throw new Error(response.error_message ?? 'python pipeline failed');
  }
}

export async function runPythonRegenerateShot(args: {
  taskId: string;
  shotId: string;
  ratio: Ratio;
}): Promise<void> {
  const payload = await buildPythonPipelinePayload(args.taskId, args.ratio);
  const shot = payload.shots.find((item) => item.id === args.shotId);
  if (!shot) throw new Error(`shot ${args.shotId} not found for task ${args.taskId}`);
  const response = await callAgent<PipelineRunResponse>(
    '/pipeline/regenerate-shot',
    {
      ...payload,
      shot,
    },
    {
      signal: AbortSignal.timeout(env.ARK_VIDEO_POLL_TIMEOUT_MS + 120_000),
    },
  );

  if (response.status === 'failed') {
    throw new Error(response.error_message ?? 'python regenerate failed');
  }
}

async function buildPythonPipelinePayload(taskId: string, ratio: Ratio) {
  const task = await prisma.videoTask.findUnique({
    where: { id: taskId },
    include: {
      product: true,
      shots: { orderBy: { idx: 'asc' } },
    },
  });
  if (!task) throw new Error(`task ${taskId} not found`);

  const mainMaterial = task.product.mainMaterialId
    ? await prisma.material.findUnique({ where: { id: task.product.mainMaterialId } })
    : null;
  const sourceMaterialIds = task.shots
    .map((shot) => shot.sourceMaterialId)
    .filter((id): id is string => !!id);
  const sourceMaterials = sourceMaterialIds.length
    ? await prisma.material.findMany({ where: { id: { in: sourceMaterialIds } } })
    : [];
  const materialPath = new Map(sourceMaterials.map((m) => [m.id, path.join(STORAGE_ROOT, m.path)]));

  return {
    task_id: task.id,
    ratio,
    storage_root: STORAGE_ROOT,
    product_main_material_path:
      mainMaterial?.kind === 'image' ? path.join(STORAGE_ROOT, mainMaterial.path) : null,
    shots: task.shots.map((shot) => ({
      id: shot.id,
      idx: shot.idx,
      description: shot.description,
      camera_motion: shot.cameraMotion,
      duration_sec: shot.durationSec,
      prompt: shot.prompt,
      subtitle: shot.subtitle,
      bgm_hint: shot.bgmHint,
      source_material_id: shot.sourceMaterialId,
      source_material_path: shot.sourceMaterialId
        ? (materialPath.get(shot.sourceMaterialId) ?? null)
        : null,
      retry_count: shot.retryCount,
      clip_path: shot.clipPath,
    })),
    enable_subtitle: env.P1_ENABLE_SUBTITLE,
    enable_bgm: env.P1_ENABLE_BGM,
    callback_base_url: env.PUBLIC_BASE_URL,
    callback_token: env.INTERNAL_CALLBACK_TOKEN,
  };
}
