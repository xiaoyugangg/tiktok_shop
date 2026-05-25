import { prisma } from '../../lib/prisma';
import { generateScript } from '../../providers/volcArk';

import type { Ratio, Script, ScriptDto } from '@tiktop/shared';

export async function createScriptForProduct(args: {
  productId: string;
  ratio?: Ratio;
}): Promise<ScriptDto> {
  const product = await prisma.product.findUnique({ where: { id: args.productId } });
  if (!product) throw new Error(`product ${args.productId} not found`);

  let sellingPoints: string[] = [];
  try {
    sellingPoints = JSON.parse(product.sellingPoints) as string[];
  } catch {
    sellingPoints = [];
  }

  const ratio: Ratio = args.ratio ?? '9:16';
  const script = await generateScript({
    product: {
      title: product.title,
      sellingPoints: sellingPoints.length ? sellingPoints : [product.title],
      targetAudience: product.targetAudience ?? undefined,
      scene: product.scene ?? undefined,
      mainMaterialId: product.mainMaterialId ?? undefined,
      ratio,
    },
  });

  const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record = await prisma.script.create({
    data: {
      id,
      productId: product.id,
      payload: JSON.stringify(script),
    },
  });

  return {
    id: record.id,
    productId: record.productId,
    payload: script,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function getScript(id: string): Promise<ScriptDto | null> {
  const record = await prisma.script.findUnique({ where: { id } });
  if (!record) return null;
  let payload: Script;
  try {
    payload = JSON.parse(record.payload) as Script;
  } catch {
    return null;
  }
  return {
    id: record.id,
    productId: record.productId,
    payload,
    createdAt: record.createdAt.toISOString(),
  };
}
