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

function ffprobeValue(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', ['-v', 'error', ...args], { windowsHide: true });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout.on('data', (b: Buffer) => stdoutChunks.push(b));
    proc.stderr.on('data', (b: Buffer) => stderrChunks.push(b));
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString('utf8').trim());
        return;
      }
      reject(new Error(Buffer.concat(stderrChunks).toString('utf8').trim()));
    });
  });
}

async function hasAudioStream(clipPath: string): Promise<boolean> {
  const value = await ffprobeValue([
    '-select_streams',
    'a',
    '-show_entries',
    'stream=codec_type',
    '-of',
    'csv=p=0',
    clipPath,
  ]);
  return value.length > 0;
}

async function durationSeconds(clipPath: string): Promise<number> {
  const value = await ffprobeValue([
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    clipPath,
  ]);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0.1, parsed) : 1;
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

  const filterParts: string[] = [];
  for (const [i, clipPath] of params.clipPaths.entries()) {
    filterParts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24[v${i}]`,
    );
    if (await hasAudioStream(clipPath)) {
      filterParts.push(
        `[${i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`,
      );
    } else {
      const duration = await durationSeconds(clipPath);
      filterParts.push(
        `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${duration.toFixed(
          3,
        )},asetpts=PTS-STARTPTS[a${i}]`,
      );
    }
  }
  const concatInputs = params.clipPaths.map((_, i) => `[v${i}][a${i}]`).join('');
  const filterGraph = `${filterParts.join(';')};${concatInputs}concat=n=${
    params.clipPaths.length
  }:v=1:a=1[outv][outa]`;

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
    '-map',
    '[outa]',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
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
