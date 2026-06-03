import { GenerateScriptReqSchema } from '@tiktop/shared';
import { Router } from 'express';

import { env } from '../../env';
import { callAgent, type EditingPlanResponse } from '../../lib/agentClient';
import { prisma } from '../../lib/prisma';

import {
  createScriptForProduct,
  getLatestEditingPlan,
  getScript,
  listEditingPlans,
  saveEditingPlan,
} from './script.service';

export const scriptRouter: Router = Router();

type MaterialForPlan = {
  id: string;
  kind: string;
  caption: string | null;
  summary: string | null;
  filename: string;
  tagsJson: string | null;
  embeddingText: string | null;
  embeddingVectorJson: string | null;
  embeddingModel: string | null;
};

scriptRouter.post('/', async (req, res, next) => {
  try {
    const parsed = GenerateScriptReqSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'invalid request', issues: parsed.error.issues });
      return;
    }
    const dto = await createScriptForProduct(parsed.data);
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
});

scriptRouter.get('/:id', async (req, res, next) => {
  try {
    const dto = await getScript(req.params.id);
    if (!dto) {
      res.status(404).json({ message: 'script not found' });
      return;
    }
    res.json(dto);
  } catch (err) {
    next(err);
  }
});

scriptRouter.get('/:id/editing-plans', async (req, res, next) => {
  try {
    res.json(await listEditingPlans(req.params.id));
  } catch (err) {
    next(err);
  }
});

scriptRouter.get('/:id/editing-plans/latest', async (req, res, next) => {
  try {
    const dto = await getLatestEditingPlan(req.params.id);
    if (!dto) {
      res.status(404).json({ message: 'editing plan not found' });
      return;
    }
    res.json(dto);
  } catch (err) {
    next(err);
  }
});

scriptRouter.post('/:id/editing-plan', async (req, res, next) => {
  try {
    const script = await prisma.script.findUnique({
      where: { id: req.params.id },
      include: { product: { include: { materials: true } } },
    });
    if (!script) {
      res.status(404).json({ message: 'script not found' });
      return;
    }

    const payload = JSON.parse(script.payload) as {
      narrative: string;
      visualStyle: string;
      ratio: string;
      shots: Array<{
        idx: number;
        description: string;
        cameraMotion?: string;
        subtitle?: string;
        bgmHint?: string;
        durationSec: number;
      }>;
    };

    let sellingPoints: string[] = [];
    try {
      sellingPoints = JSON.parse(script.product.sellingPoints) as string[];
    } catch {
      sellingPoints = [];
    }
    const candidateMaterials = await collectCandidateMaterials({
      mainMaterialId: script.product.mainMaterialId,
      materials: script.product.materials,
    });

    const result = await callAgent<EditingPlanResponse>(
      '/editing/plan',
      {
        product: {
          id: script.product.id,
          title: script.product.title,
          selling_points: sellingPoints,
          target_audience: script.product.targetAudience,
          scene: script.product.scene,
        },
        script: {
          narrative: payload.narrative,
          visual_style: payload.visualStyle,
          ratio: payload.ratio,
          shots: payload.shots.map((shot) => ({
            idx: shot.idx,
            description: shot.description,
            camera_motion: shot.cameraMotion ?? '',
            subtitle: shot.subtitle ?? '',
            bgm_hint: shot.bgmHint ?? '',
            duration_sec: shot.durationSec,
          })),
        },
        materials: candidateMaterials.map((material) => ({
          material_id: material.id,
          kind: material.kind,
          caption: material.caption,
          summary: material.summary ?? material.filename,
          tags: parseJsonStringArray(material.tagsJson),
          embedding_text: material.embeddingText ?? '',
          embedding_vector: parseJsonNumberArray(material.embeddingVectorJson),
          embedding_model: material.embeddingModel,
        })),
      },
      { signal: AbortSignal.timeout(Math.max(env.AGENT_TIMEOUT_MS, 180_000)) },
    );

    const dto = await saveEditingPlan({
      scriptId: script.id,
      strategy: result.strategy,
      trace: result.trace,
      shots: result.shots.map((shot) => ({
        idx: shot.idx,
        prompt: shot.prompt,
        subtitle: shot.subtitle,
        bgmHint: shot.bgm_hint,
        durationSec: shot.duration_sec,
        sourceMaterialId: shot.source_material_id,
        reason: shot.reason,
      })),
    });

    res.json(dto);
  } catch (err) {
    next(err);
  }
});

async function collectCandidateMaterials(product: {
  mainMaterialId: string | null;
  materials: MaterialForPlan[];
}): Promise<MaterialForPlan[]> {
  const byId = new Map<string, MaterialForPlan>();
  const add = (material: MaterialForPlan | null) => {
    if (material?.kind === 'image') byId.set(material.id, material);
  };

  for (const material of product.materials) add(material);

  if (product.mainMaterialId && !byId.has(product.mainMaterialId)) {
    add(await prisma.material.findUnique({ where: { id: product.mainMaterialId } }));
  }

  if (byId.size === 0 || product.materials.length === 0) {
    const globalAnalyzedImages = await prisma.material.findMany({
      where: { kind: 'image', analyzedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    for (const material of globalAnalyzedImages) add(material);
  }

  return [...byId.values()];
}

function parseJsonStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonNumberArray(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === 'number') : [];
  } catch {
    return [];
  }
}
