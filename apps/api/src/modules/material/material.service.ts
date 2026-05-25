import { promises as fs } from 'node:fs';
import path from 'node:path';

import { callAgent, type MaterialAnalyzeResponse } from '../../lib/agentClient';
import { prisma } from '../../lib/prisma';
import { STORAGE_ROOT, ensureDir, publicUrlForRelative, relativeFromAbs } from '../../lib/storage';

import type { MaterialDto } from '@tiktop/shared';

function detectKind(mime: string): 'image' | 'video' {
  if (mime.startsWith('video/')) return 'video';
  return 'image';
}

export async function saveUploadedMaterial(args: {
  buffer: Buffer;
  originalName: string;
  mime: string;
  productId?: string;
}): Promise<MaterialDto> {
  const id = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ext = path.extname(args.originalName) || '';
  const filename = `${id}${ext}`;
  const dir = path.join(STORAGE_ROOT, 'uploads');
  await ensureDir(dir);
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, args.buffer);
  const rel = relativeFromAbs(abs);

  const record = await prisma.material.create({
    data: {
      id,
      kind: detectKind(args.mime),
      filename: args.originalName,
      path: rel,
      mime: args.mime,
      size: args.buffer.byteLength,
      productId: args.productId,
    },
  });

  return toDto(record);
}

export async function listMaterials(filter: { productId?: string }) {
  const records = await prisma.material.findMany({
    where: filter.productId ? { productId: filter.productId } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  return records.map(toDto);
}

export async function deleteMaterial(id: string): Promise<void> {
  const record = await prisma.material.findUnique({ where: { id } });
  if (!record) return;
  const abs = path.join(STORAGE_ROOT, record.path);
  await fs.unlink(abs).catch(() => undefined);
  await prisma.material.delete({ where: { id } });
}

export async function analyzeMaterial(id: string): Promise<MaterialDto | null> {
  const record = await prisma.material.findUnique({
    where: { id },
    include: { product: true },
  });
  if (!record) return null;

  let sellingPoints: string[] = [];
  if (record.product?.sellingPoints) {
    try {
      sellingPoints = JSON.parse(record.product.sellingPoints) as string[];
    } catch {
      sellingPoints = [];
    }
  }

  const result = await callAgent<MaterialAnalyzeResponse>('/materials/analyze', {
    material_id: record.id,
    filename: record.filename,
    mime: record.mime,
    kind: record.kind,
    product_title: record.product?.title ?? null,
    selling_points: sellingPoints,
  });

  const updated = await prisma.material.update({
    where: { id },
    data: {
      summary: result.summary,
      tagsJson: JSON.stringify(result.tags),
      embeddingText: result.embedding_text,
      embeddingVectorJson: JSON.stringify(result.embedding_vector),
      analyzedAt: new Date(),
    },
  });

  return toDto(updated);
}

function parseTags(tagsJson: string | null | undefined): string[] {
  if (!tagsJson) return [];
  try {
    const tags = JSON.parse(tagsJson) as unknown;
    return Array.isArray(tags) ? tags.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function toDto(record: {
  id: string;
  kind: string;
  filename: string;
  path: string;
  mime: string;
  size: number;
  summary?: string | null;
  tagsJson?: string | null;
  embeddingText?: string | null;
  analyzedAt?: Date | null;
  productId: string | null;
  createdAt: Date;
}): MaterialDto {
  return {
    id: record.id,
    kind: record.kind === 'video' ? 'video' : 'image',
    filename: record.filename,
    url: publicUrlForRelative(record.path),
    mime: record.mime,
    size: record.size,
    summary: record.summary ?? null,
    tags: parseTags(record.tagsJson),
    embeddingText: record.embeddingText ?? null,
    analyzedAt: record.analyzedAt?.toISOString() ?? null,
    productId: record.productId,
    createdAt: record.createdAt.toISOString(),
  };
}
