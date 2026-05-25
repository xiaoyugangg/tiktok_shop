import { prisma } from '../../lib/prisma';

import type { CreateProductReq, ProductDto } from '@tiktop/shared';

export async function createProduct(input: CreateProductReq): Promise<ProductDto> {
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record = await prisma.product.create({
    data: {
      id,
      title: input.title,
      sellingPoints: JSON.stringify(input.sellingPoints),
      targetAudience: input.targetAudience ?? null,
      scene: input.scene ?? null,
      mainMaterialId: input.mainMaterialId ?? null,
    },
  });
  return toDto(record);
}

export async function getProduct(id: string): Promise<ProductDto | null> {
  const record = await prisma.product.findUnique({ where: { id } });
  return record ? toDto(record) : null;
}

export async function listProducts(): Promise<ProductDto[]> {
  const records = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
  return records.map(toDto);
}

function toDto(record: {
  id: string;
  title: string;
  sellingPoints: string;
  targetAudience: string | null;
  scene: string | null;
  mainMaterialId: string | null;
  createdAt: Date;
}): ProductDto {
  let sellingPoints: string[] = [];
  try {
    sellingPoints = JSON.parse(record.sellingPoints) as string[];
  } catch {
    sellingPoints = [];
  }
  return {
    id: record.id,
    title: record.title,
    sellingPoints,
    targetAudience: record.targetAudience,
    scene: record.scene,
    mainMaterialId: record.mainMaterialId,
    createdAt: record.createdAt.toISOString(),
  };
}
