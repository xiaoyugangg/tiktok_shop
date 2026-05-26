import path from 'node:path';

import { env } from '../../env';
import {
  callAgent,
  type PostprocessResponse,
  type RetryDecisionResponse,
} from '../../lib/agentClient';
import { concatClips } from '../../lib/ffmpeg';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { videoQueue } from '../../lib/queue';
import { STORAGE_ROOT, ensureDir, relativeFromAbs } from '../../lib/storage';
import { generateClip } from '../../providers/volcSeedance';
import { setShotStatus, setTaskStatus } from '../task/task.service';
import { addTrace } from '../trace/trace.service';

import type { Ratio, Script } from '@tiktop/shared';

type StitchShot = {
  idx: number;
  description: string;
  durationSec: number;
  subtitle: string | null;
};

export async function runPipeline(args: {
  taskId: string;
  script: Script;
  ratio: Ratio;
}): Promise<void> {
  const { taskId, script, ratio } = args;
  const log = logger.child({ taskId });

  try {
    await setTaskStatus({ taskId, status: 'shots_running', stage: 'Generating shots' });

    const productMaterial = await getProductMainMaterial(taskId);
    const shots = await prisma.shot.findMany({ where: { taskId }, orderBy: { idx: 'asc' } });

    const shotResults = await Promise.all(
      shots.map((shot) =>
        videoQueue.add(async () => {
          try {
            log.info({ shotIdx: shot.idx }, 'generating shot');
            const clipAbs = await generateOneShot({
              taskId,
              shotId: shot.id,
              ratio,
              productMaterial: shot.idx === 0 ? productMaterial : null,
            });
            return { ok: true as const, idx: shot.idx, clipAbs };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error({ shotIdx: shot.idx, err: msg }, 'shot generation failed');
            return { ok: false as const, idx: shot.idx, error: msg };
          }
        }),
      ),
    );

    const failed = shotResults.find((r) => r && !r.ok);
    if (failed) {
      const msg = failed.ok === false ? failed.error : 'unknown shot failure';
      throw new Error(`shot ${failed.idx + 1} failed: ${msg}`);
    }

    const orderedClips = shotResults
      .filter((r): r is { ok: true; idx: number; clipAbs: string } => !!r && r.ok)
      .sort((a, b) => a.idx - b.idx)
      .map((r) => r.clipAbs);

    if (orderedClips.length === 0) {
      throw new Error('no clips generated');
    }

    await setTaskStatus({ taskId, status: 'stitching', stage: 'Stitching video' });
    const outRel = await stitchClips({
      taskId,
      ratio,
      clips: orderedClips,
      shots: await prisma.shot.findMany({ where: { taskId }, orderBy: { idx: 'asc' } }),
    });
    log.info({ outRel }, 'task succeeded');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'task failed');
    await setTaskStatus({ taskId, status: 'failed', errorMsg: msg, stage: 'Failed' });
  }

  void script;
}

export async function generateOneShot(args: {
  taskId: string;
  shotId: string;
  ratio: Ratio;
  productMaterial?: string | null;
  allowRetry?: boolean;
}): Promise<string> {
  const { taskId, shotId, ratio } = args;
  const allowRetry = args.allowRetry ?? true;
  const shot = await prisma.shot.findFirst({ where: { id: shotId, taskId } });
  if (!shot) throw new Error(`shot ${shotId} not found`);

  const taskDir = path.join(STORAGE_ROOT, 'tasks', taskId, 'shots');
  await ensureDir(taskDir);
  const clipAbs = path.join(taskDir, `shot_${shot.idx}.mp4`);
  const prompt = shot.prompt ?? shot.description;
  const sourceMaterial = await getShotSourceMaterial(shot.sourceMaterialId);
  const imagePath = sourceMaterial ?? args.productMaterial ?? undefined;

  await addTrace({
    taskId,
    shotId,
    stage: 'shot.generate.start',
    message: `Generating shot ${shot.idx + 1}`,
    payload: { retryCount: shot.retryCount, prompt },
  });

  try {
    await generateClip({
      prompt,
      ratio,
      durationSec: shot.durationSec,
      imagePath,
      outPath: clipAbs,
    });
    const clipRel = relativeFromAbs(clipAbs);
    await setShotStatus({ shotId: shot.id, status: 'video_ok', clipPath: clipRel });
    await addTrace({
      taskId,
      shotId,
      stage: 'shot.generate.success',
      message: `Shot ${shot.idx + 1} generated`,
      payload: { clipPath: clipRel },
    });
    return clipAbs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setShotStatus({ shotId: shot.id, status: 'failed', errorMsg: msg });
    await addTrace({
      taskId,
      shotId,
      stage: 'shot.generate.failed',
      level: 'error',
      message: msg,
    });

    if (!allowRetry || shot.retryCount >= 2) {
      throw err;
    }

    const decision = await decideShotRetry({
      taskId,
      shotId: shot.id,
      shotIdx: shot.idx,
      errorMessage: msg,
      retryCount: shot.retryCount,
      prompt,
      durationSec: shot.durationSec,
    });

    await addTrace({
      taskId,
      shotId: shot.id,
      stage: 'agent.retry.decision',
      message: decision.reason,
      payload: decision as unknown as Record<string, unknown>,
    });

    if (!decision.should_retry) {
      throw err;
    }

    await prisma.shot.update({
      where: { id: shot.id },
      data: {
        prompt: decision.patch?.prompt ?? undefined,
        durationSec: decision.patch?.duration_sec ?? undefined,
        retryCount: { increment: 1 },
      },
    });

    return generateOneShot({
      taskId,
      shotId,
      ratio,
      productMaterial: args.productMaterial,
      allowRetry: false,
    });
  }
}

export async function restitchTask(taskId: string, ratio: Ratio): Promise<void> {
  const shots = await prisma.shot.findMany({ where: { taskId }, orderBy: { idx: 'asc' } });
  const missing = shots.find((shot) => !shot.clipPath);
  if (missing) throw new Error(`shot ${missing.idx + 1} has no clip to stitch`);

  const clips = shots.map((shot) => path.join(STORAGE_ROOT, shot.clipPath as string));
  await stitchClips({ taskId, ratio, clips, shots });
}

async function stitchClips(args: {
  taskId: string;
  ratio: Ratio;
  clips: string[];
  shots: StitchShot[];
}): Promise<string> {
  const outAbs = path.join(STORAGE_ROOT, 'tasks', args.taskId, 'output.mp4');
  await ensureDir(path.dirname(outAbs));
  await concatClips({ clipPaths: args.clips, outPath: outAbs, ratio: args.ratio });
  const outRel = relativeFromAbs(outAbs);

  const finalRel = await postprocessOutput({
    taskId: args.taskId,
    ratio: args.ratio,
    outAbs,
    outRel,
    shots: args.shots,
  });

  await setTaskStatus({
    taskId: args.taskId,
    status: 'succeeded',
    outputPath: finalRel,
    stage: 'Completed',
  });
  return finalRel;
}

async function postprocessOutput(args: {
  taskId: string;
  ratio: Ratio;
  outAbs: string;
  outRel: string;
  shots: StitchShot[];
}): Promise<string> {
  if (!env.P1_ENABLE_SUBTITLE && !env.P1_ENABLE_BGM) {
    return args.outRel;
  }

  let cursor = 0;
  const subtitles = args.shots.map((shot) => {
    const start = cursor;
    cursor += shot.durationSec;
    return {
      start_sec: start,
      end_sec: cursor,
      text: shot.subtitle || shot.description.slice(0, 24),
    };
  });

  const postAbs = path.join(STORAGE_ROOT, 'tasks', args.taskId, 'output_p1.mp4');
  try {
    const response = await callAgent<PostprocessResponse>('/media/postprocess', {
      input_path: args.outAbs,
      output_path: postAbs,
      ratio: args.ratio,
      subtitles,
      enable_subtitle: env.P1_ENABLE_SUBTITLE,
      enable_bgm: env.P1_ENABLE_BGM,
    });
    const finalRel = relativeFromAbs(postAbs);
    await addTrace({
      taskId: args.taskId,
      stage: 'media.postprocess.done',
      message: 'Postprocess completed',
      payload: response as unknown as Record<string, unknown>,
    });
    return finalRel;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await addTrace({
      taskId: args.taskId,
      stage: 'media.postprocess.failed',
      level: 'warn',
      message: msg,
    });
    return args.outRel;
  }
}

async function decideShotRetry(args: {
  taskId: string;
  shotId: string;
  shotIdx: number;
  errorMessage: string;
  retryCount: number;
  prompt: string;
  durationSec: number;
}): Promise<RetryDecisionResponse> {
  try {
    return await callAgent<RetryDecisionResponse>('/retry/decide', {
      task_id: args.taskId,
      shot_id: args.shotId,
      shot_idx: args.shotIdx,
      error_message: args.errorMessage,
      retry_count: args.retryCount,
      prompt: args.prompt,
      duration_sec: args.durationSec,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      should_retry: false,
      reason: `Retry agent unavailable: ${msg}`,
      patch: {},
      trace: [],
    };
  }
}

async function getProductMainMaterial(taskId: string): Promise<string | null> {
  const task = await prisma.videoTask.findUnique({
    where: { id: taskId },
    include: { product: true },
  });
  if (!task?.product?.mainMaterialId) return null;
  const material = await prisma.material.findUnique({
    where: { id: task.product.mainMaterialId },
  });
  if (!material) return null;
  if (material.kind !== 'image') return null;
  return material.path;
}

async function getShotSourceMaterial(materialId: string | null): Promise<string | null> {
  if (!materialId) return null;
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material || material.kind !== 'image') return null;
  return material.path;
}
