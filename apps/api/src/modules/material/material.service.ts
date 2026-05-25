import { promises as fs } from 'node:fs';
import path from 'node:path';

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

export function toDto(record: {
  id: string;
  kind: string;
  filename: string;
  path: string;
  mime: string;
  size: number;
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
    productId: record.productId,
    createdAt: record.createdAt.toISOString(),
  };
}
