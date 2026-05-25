import path from 'node:path';

import { concatClips } from '../../lib/ffmpeg';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { videoQueue } from '../../lib/queue';
import { STORAGE_ROOT, ensureDir, relativeFromAbs } from '../../lib/storage';
import { generateClip } from '../../providers/volcSeedance';
import { setShotStatus, setTaskStatus } from '../task/task.service';

import type { Ratio, Script } from '@tiktop/shared';

export async function runPipeline(args: {
  taskId: string;
  script: Script;
  ratio: Ratio;
}): Promise<void> {
  const { taskId, script, ratio } = args;
  const log = logger.child({ taskId });

  try {
    await setTaskStatus({ taskId, status: 'shots_running', stage: '生成分镜中' });

    const taskDir = path.join(STORAGE_ROOT, 'tasks', taskId, 'shots');
    await ensureDir(taskDir);

    const productMaterial = await getProductMainMaterial(taskId);

    const shots = await prisma.shot.findMany({ where: { taskId }, orderBy: { idx: 'asc' } });

    const shotResults = await Promise.all(
      shots.map((shot) =>
        videoQueue.add(async () => {
          const clipAbs = path.join(taskDir, `shot_${shot.idx}.mp4`);
          try {
            log.info({ shotIdx: shot.idx }, 'generating shot');
            await generateClip({
              prompt: shot.description,
              ratio,
              durationSec: shot.durationSec,
              imagePath: shot.idx === 0 ? (productMaterial ?? undefined) : undefined,
              outPath: clipAbs,
            });
            const clipRel = relativeFromAbs(clipAbs);
            await setShotStatus({ shotId: shot.id, status: 'video_ok', clipPath: clipRel });
            return { ok: true as const, idx: shot.idx, clipAbs };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error({ shotIdx: shot.idx, err: msg }, 'shot generation failed');
            await setShotStatus({ shotId: shot.id, status: 'failed', errorMsg: msg });
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

    await setTaskStatus({ taskId, status: 'stitching', stage: '拼接视频中' });

    const outAbs = path.join(STORAGE_ROOT, 'tasks', taskId, 'output.mp4');
    await ensureDir(path.dirname(outAbs));
    await concatClips({ clipPaths: orderedClips, outPath: outAbs, ratio });
    const outRel = relativeFromAbs(outAbs);

    await setTaskStatus({
      taskId,
      status: 'succeeded',
      outputPath: outRel,
      stage: '完成',
    });
    log.info({ outRel }, 'task succeeded');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'task failed');
    await setTaskStatus({ taskId, status: 'failed', errorMsg: msg, stage: '失败' });
  }

  void script;
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
