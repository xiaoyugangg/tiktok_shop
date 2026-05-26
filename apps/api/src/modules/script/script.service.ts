import { ScriptSchema, type Ratio, type Script, type ScriptDto } from '@tiktop/shared';

import { callAgent, type ScriptGenerateResponse } from '../../lib/agentClient';
import { prisma } from '../../lib/prisma';
import { generateScript } from '../../providers/volcArk';

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
  let script: Script;
  try {
    const result = await callAgent<ScriptGenerateResponse>('/scripts/generate', {
      product: {
        id: product.id,
        title: product.title,
        selling_points: sellingPoints.length ? sellingPoints : [product.title],
        target_audience: product.targetAudience,
        scene: product.scene,
      },
      ratio,
    });
    script = ScriptSchema.parse({
      narrative: result.narrative,
      visualStyle: result.visual_style,
      ratio: result.ratio,
      shots: result.shots.map((shot) => ({
        idx: shot.idx,
        description: shot.description,
        cameraMotion: shot.camera_motion,
        subtitle: shot.subtitle,
        bgmHint: shot.bgm_hint,
        durationSec: shot.duration_sec,
      })),
      constraints: result.constraints,
    });
  } catch {
    script = await generateScript({
      product: {
        title: product.title,
        sellingPoints: sellingPoints.length ? sellingPoints : [product.title],
        targetAudience: product.targetAudience ?? undefined,
        scene: product.scene ?? undefined,
        mainMaterialId: product.mainMaterialId ?? undefined,
        ratio,
      },
    });
  }

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
