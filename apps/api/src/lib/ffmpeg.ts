import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { logger } from './logger';

import type { Ratio } from '@tiktop/shared';

const RATIO_RESOLUTION: Record<Ratio, { width: number; height: number }> = {
  '9:16': { width: 720, height: 1280 },
  '16:9': { width: 1280, height: 720 },
};

export function ratioResolution(ratio: Ratio) {
  return RATIO_RESOLUTION[ratio];
}

function escapeDrawText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\r?\n/g, ' ');
}

function runFfmpeg(args: string[], stage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info({ stage, cmd: `ffmpeg ${args.join(' ')}` }, 'ffmpeg start');
    const proc = spawn('ffmpeg', args, { windowsHide: true });
    const stderrChunks: Buffer[] = [];
    proc.stderr.on('data', (b: Buffer) => stderrChunks.push(b));
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      const tail = stderr.split(/\r?\n/).filter(Boolean).slice(-5).join(' | ');
      reject(new Error(`ffmpeg exited ${code}: ${tail}`));
    });
  });
}

export interface MockClipParams {
  outPath: string;
  durationSec: number;
  ratio: Ratio;
  label: string;
  color?: string;
}

export async function generateMockClip(params: MockClipParams): Promise<void> {
  const { width, height } = RATIO_RESOLUTION[params.ratio];
  const color = params.color ?? randomMockColor();
  const safeLabel = escapeDrawText(params.label.slice(0, 36));
  const fontSize = Math.round(Math.min(width, height) / 18);
  await fs.mkdir(path.dirname(params.outPath), { recursive: true });

  const filter =
    `drawtext=text='${safeLabel}':fontcolor=white:fontsize=${fontSize}` +
    `:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10`;

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-t',
    params.durationSec.toFixed(2),
    '-i',
    `color=c=${color}:s=${width}x${height}:r=24`,
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-movflags',
    '+faststart',
    params.outPath,
  ];

  await runFfmpeg(args, 'mock_clip');
}

export interface ConcatParams {
  clipPaths: string[];
  outPath: string;
  ratio: Ratio;
}

export async function concatClips(params: ConcatParams): Promise<void> {
  const { width, height } = RATIO_RESOLUTION[params.ratio];
  await fs.mkdir(path.dirname(params.outPath), { recursive: true });

  const inputs: string[] = [];
  for (const clip of params.clipPaths) {
    inputs.push('-i', clip);
  }

  const filterInputs = params.clipPaths
    .map(
      (_, i) =>
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24[v${i}]`,
    )
    .join(';');
  const concatInputs = params.clipPaths.map((_, i) => `[v${i}]`).join('');
  const filterGraph = `${filterInputs};${concatInputs}concat=n=${params.clipPaths.length}:v=1:a=0[outv]`;

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...inputs,
    '-filter_complex',
    filterGraph,
    '-map',
    '[outv]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-movflags',
    '+faststart',
    params.outPath,
  ];

  await runFfmpeg(args, 'concat');
}

function randomMockColor(): string {
  const palette = ['0x2e6df5', '0xff2c55', '0xff7a45', '0x52c41a', '0x722ed1', '0x13c2c2'];
  return palette[Math.floor(Math.random() * palette.length)] ?? '0x2e6df5';
}
