import { promises as fs } from 'node:fs';
import path from 'node:path';

import { type ReferenceVideoAnalysisResponse, callAgent } from '../../lib/agentClient';
import { prisma } from '../../lib/prisma';
import { STORAGE_ROOT, ensureDir, publicUrlForRelative, relativeFromAbs } from '../../lib/storage';

import type {
  CreateReferenceVideoReq,
  ReferenceVideoAnalysisDto,
  ReferenceVideoDto,
} from '@tiktop/shared';

export async function listReferenceVideos(): Promise<ReferenceVideoDto[]> {
  const records = await prisma.referenceVideo.findMany({
    include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
  });
  return records.map(toReferenceVideoDto);
}

export async function createReferenceVideo(input: CreateReferenceVideoReq): Promise<ReferenceVideoDto> {
  const id = `rv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record = await prisma.referenceVideo.create({
    data: {
      id,
      title: input.title,
      sourceType: input.sourceUrl ? 'url' : 'manual',
      sourceUrl: input.sourceUrl ?? null,
      category: input.category ?? null,
      keywordsJson: JSON.stringify(input.keywords ?? []),
    },
    include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return toReferenceVideoDto(record);
}

export async function uploadReferenceVideo(args: {
  buffer: Buffer;
  originalName: string;
  mime: string;
  title?: string;
  category?: string;
  keywords?: string[];
}): Promise<ReferenceVideoDto> {
  const id = `rv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ext = path.extname(args.originalName) || '.mp4';
  const filename = `${id}${ext}`;
  const dir = path.join(STORAGE_ROOT, 'references');
  await ensureDir(dir);
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, args.buffer);

  const record = await prisma.referenceVideo.create({
    data: {
      id,
      title: args.title || path.parse(args.originalName).name,
      sourceType: 'upload',
      filename: args.originalName,
      path: relativeFromAbs(abs),
      mime: args.mime,
      size: args.buffer.byteLength,
      category: args.category ?? null,
      keywordsJson: JSON.stringify(args.keywords ?? []),
    },
    include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return toReferenceVideoDto(record);
}

export async function analyzeReferenceVideo(id: string): Promise<ReferenceVideoDto | null> {
  const record = await prisma.referenceVideo.findUnique({ where: { id } });
  if (!record) return null;

  const result = await callAgent<ReferenceVideoAnalysisResponse>(
    '/references/analyze',
    {
      reference_video_id: record.id,
      title: record.title,
      path: record.path ? path.join(STORAGE_ROOT, record.path) : null,
      source_url: record.sourceUrl,
      category: record.category,
      keywords: parseStringArray(record.keywordsJson),
    },
    { signal: AbortSignal.timeout(240_000) },
  );

  await prisma.referenceVideoAnalysis.create({
    data: {
      id: `rva_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      referenceVideoId: record.id,
      summary: result.summary,
      hookType: result.hook_type,
      painPoint: result.pain_point,
      sellingPointsJson: JSON.stringify(result.selling_points),
      shotStructureJson: JSON.stringify(result.shot_structure),
      visualStyle: result.visual_style,
      subtitleStyle: result.subtitle_style,
      bgmRhythm: result.bgm_rhythm,
      ctaPattern: result.cta_pattern,
      reusableTemplate: result.reusable_template,
      keyframeCaptionsJson: JSON.stringify(result.keyframe_captions),
      traceJson: JSON.stringify(result.trace),
    },
  });

  const updated = await prisma.referenceVideo.findUnique({
    where: { id },
    include: { analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return updated ? toReferenceVideoDto(updated) : null;
}

function toReferenceVideoDto(record: {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  filename: string | null;
  path: string | null;
  mime: string | null;
  size: number | null;
  category: string | null;
  keywordsJson: string | null;
  createdAt: Date;
  analyses?: Array<{
    id: string;
    referenceVideoId: string;
    summary: string;
    hookType: string;
    painPoint: string;
    sellingPointsJson: string;
    shotStructureJson: string;
    visualStyle: string;
    subtitleStyle: string;
    bgmRhythm: string;
    ctaPattern: string;
    reusableTemplate: string;
    keyframeCaptionsJson: string;
    traceJson: string | null;
    createdAt: Date;
  }>;
}): ReferenceVideoDto {
  return {
    id: record.id,
    title: record.title,
    sourceType: record.sourceType === 'upload' || record.sourceType === 'url' ? record.sourceType : 'manual',
    sourceUrl: record.sourceUrl,
    filename: record.filename,
    url: record.path ? publicUrlForRelative(record.path) : null,
    mime: record.mime,
    size: record.size,
    category: record.category,
    keywords: parseStringArray(record.keywordsJson),
    latestAnalysis: record.analyses?.[0] ? toAnalysisDto(record.analyses[0]) : null,
    createdAt: record.createdAt.toISOString(),
  };
}

function toAnalysisDto(record: {
  id: string;
  referenceVideoId: string;
  summary: string;
  hookType: string;
  painPoint: string;
  sellingPointsJson: string;
  shotStructureJson: string;
  visualStyle: string;
  subtitleStyle: string;
  bgmRhythm: string;
  ctaPattern: string;
  reusableTemplate: string;
  keyframeCaptionsJson: string;
  traceJson: string | null;
  createdAt: Date;
}): ReferenceVideoAnalysisDto {
  return {
    id: record.id,
    referenceVideoId: record.referenceVideoId,
    summary: record.summary,
    hookType: record.hookType,
    painPoint: record.painPoint,
    sellingPoints: parseStringArray(record.sellingPointsJson),
    shotStructure: parseStringArray(record.shotStructureJson),
    visualStyle: record.visualStyle,
    subtitleStyle: record.subtitleStyle,
    bgmRhythm: record.bgmRhythm,
    ctaPattern: record.ctaPattern,
    reusableTemplate: record.reusableTemplate,
    keyframeCaptions: parseStringArray(record.keyframeCaptionsJson),
    trace: parseTrace(record.traceJson),
    createdAt: record.createdAt.toISOString(),
  };
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseTrace(value: string | null): ReferenceVideoAnalysisDto['trace'] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as ReferenceVideoAnalysisDto['trace']) : [];
  } catch {
    return [];
  }
}
