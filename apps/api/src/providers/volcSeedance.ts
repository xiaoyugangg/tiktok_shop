import { promises as fs } from 'node:fs';
import path from 'node:path';

import { env } from '../env';
import { generateMockClip } from '../lib/ffmpeg';
import { logger } from '../lib/logger';
import { STORAGE_ROOT } from '../lib/storage';

import type { Ratio } from '@tiktop/shared';

export interface GenerateClipInput {
  prompt: string;
  ratio: Ratio;
  durationSec: number;
  imagePath?: string;
  outPath: string;
}

export async function generateClip(input: GenerateClipInput): Promise<void> {
  if (env.MODEL_MODE === 'mock' || !env.ARK_API_KEY || !env.ARK_VIDEO_MODEL) {
    logger.info(
      { prompt: input.prompt.slice(0, 60), durationSec: input.durationSec },
      'using mock clip generator',
    );
    await generateMockClip({
      outPath: input.outPath,
      durationSec: input.durationSec,
      ratio: input.ratio,
      label: input.prompt,
    });
    return;
  }

  await generateClipLive(input);
}

async function generateClipLive(input: GenerateClipInput): Promise<void> {
  const headers = {
    Authorization: `Bearer ${env.ARK_API_KEY}`,
    'Content-Type': 'application/json',
  } as const;

  const duration = clampSeedanceDuration(input.durationSec);

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: input.prompt }];
  if (input.imagePath) {
    const imageUrl = await toAccessibleImageUrl(input.imagePath);
    content.push({
      type: 'image_url',
      image_url: { url: imageUrl },
      role: 'first_frame',
    });
  }

  const body = {
    model: env.ARK_VIDEO_MODEL,
    content,
    ratio: input.ratio,
    duration,
    resolution: '720p',
  } as const;

  const createResp = await fetch(`${env.ARK_BASE_URL}/contents/generations/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`seedance create task failed: ${createResp.status} ${text}`);
  }

  const createJson = (await createResp.json()) as { id?: string };
  const taskId = createJson.id;
  if (!taskId) throw new Error('seedance create task: missing id in response');

  logger.info({ taskId, model: env.ARK_VIDEO_MODEL }, 'seedance task created');

  const startedAt = Date.now();
  let videoUrl: string | null = null;
  let lastStatus = '';

  while (Date.now() - startedAt < env.ARK_VIDEO_POLL_TIMEOUT_MS) {
    await sleep(env.ARK_VIDEO_POLL_INTERVAL_MS);
    const pollResp = await fetch(`${env.ARK_BASE_URL}/contents/generations/tasks/${taskId}`, {
      method: 'GET',
      headers,
    });
    if (!pollResp.ok) {
      const text = await pollResp.text();
      logger.warn({ status: pollResp.status, body: text }, 'seedance poll non-2xx');
      continue;
    }
    const pollJson = (await pollResp.json()) as {
      status?: string;
      content?: { video_url?: string };
      error?: { message?: string };
    };
    lastStatus = pollJson.status ?? '';
    if (lastStatus === 'succeeded') {
      videoUrl = pollJson.content?.video_url ?? null;
      break;
    }
    if (lastStatus === 'failed' || lastStatus === 'cancelled') {
      throw new Error(`seedance task ${taskId} ${lastStatus}: ${pollJson.error?.message ?? ''}`);
    }
  }

  if (!videoUrl) {
    throw new Error(`seedance task ${taskId} timed out (last status: ${lastStatus})`);
  }

  await downloadFile(videoUrl, input.outPath);
  logger.info({ taskId, outPath: input.outPath }, 'seedance clip downloaded');
}

async function downloadFile(url: string, outPath: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download failed: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buf);
}

async function toAccessibleImageUrl(relativePath: string): Promise<string> {
  const abs = path.join(STORAGE_ROOT, relativePath);
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).slice(1).toLowerCase() || 'jpeg';
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const SEEDANCE_DURATION_MIN = 2;
const SEEDANCE_DURATION_MAX = 12;

export function clampSeedanceDuration(requested: number): number {
  const v = Math.round(requested);
  if (Number.isNaN(v)) return 5;
  return Math.max(SEEDANCE_DURATION_MIN, Math.min(SEEDANCE_DURATION_MAX, v));
}
