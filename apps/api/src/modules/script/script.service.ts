import {
  ScriptSchema,
  type EditingPlanDto,
  type PlannedShotDto,
  type Ratio,
  type Script,
  type ScriptDto,
} from '@tiktop/shared';

import { callAgent, type ScriptGenerateResponse } from '../../lib/agentClient';
import { prisma } from '../../lib/prisma';

export async function createScriptForProduct(args: {
  productId: string;
  ratio?: Ratio;
  referenceAnalysisId?: string;
}): Promise<ScriptDto> {
  const product = await prisma.product.findUnique({ where: { id: args.productId } });
  if (!product) throw new Error(`product ${args.productId} not found`);
  const referenceAnalysis = args.referenceAnalysisId
    ? await prisma.referenceVideoAnalysis.findUnique({ where: { id: args.referenceAnalysisId } })
    : null;
  if (args.referenceAnalysisId && !referenceAnalysis) {
    throw new Error(`reference analysis ${args.referenceAnalysisId} not found`);
  }

  let sellingPoints: string[] = [];
  try {
    sellingPoints = JSON.parse(product.sellingPoints) as string[];
  } catch {
    sellingPoints = [];
  }

  const ratio: Ratio = args.ratio ?? '9:16';
  const result = await callAgent<ScriptGenerateResponse>('/scripts/generate', {
    product: {
      id: product.id,
      title: product.title,
      selling_points: sellingPoints.length ? sellingPoints : [product.title],
      target_audience: product.targetAudience,
      scene: product.scene,
    },
    ratio,
    reference_analysis: referenceAnalysis
      ? {
          id: referenceAnalysis.id,
          summary: referenceAnalysis.summary,
          hook_type: referenceAnalysis.hookType,
          pain_point: referenceAnalysis.painPoint,
          selling_points: parseJsonStringArray(referenceAnalysis.sellingPointsJson),
          shot_structure: parseJsonStringArray(referenceAnalysis.shotStructureJson),
          visual_style: referenceAnalysis.visualStyle,
          subtitle_style: referenceAnalysis.subtitleStyle,
          bgm_rhythm: referenceAnalysis.bgmRhythm,
          cta_pattern: referenceAnalysis.ctaPattern,
          reusable_template: referenceAnalysis.reusableTemplate,
        }
      : null,
  });
  const normalizedShots = result.shots.slice(0, 3).map((shot, idx) => ({
    idx,
    description: shot.description,
    cameraMotion: shot.camera_motion,
    subtitle: shot.subtitle,
    bgmHint: shot.bgm_hint,
    durationSec: Math.max(4, Math.min(12, Math.round(shot.duration_sec))),
  }));
  const script: Script = ScriptSchema.parse({
    narrative: result.narrative,
    visualStyle: result.visual_style,
    ratio: result.ratio,
    shots: normalizedShots,
    constraints: result.constraints,
  });

  const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record = await prisma.script.create({
    data: {
      id,
      productId: product.id,
      referenceAnalysisId: referenceAnalysis?.id ?? null,
      payload: JSON.stringify(script),
    },
  });

  return {
    id: record.id,
    productId: record.productId,
    referenceAnalysisId: record.referenceAnalysisId,
    payload: script,
    createdAt: record.createdAt.toISOString(),
  };
}

function parseJsonStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
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
    referenceAnalysisId: record.referenceAnalysisId,
    payload,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function saveEditingPlan(args: {
  scriptId: string;
  strategy: string;
  trace: EditingPlanDto['trace'];
  shots: PlannedShotDto[];
}): Promise<EditingPlanDto> {
  const id = `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record = await prisma.editingPlan.create({
    data: {
      id,
      scriptId: args.scriptId,
      strategy: args.strategy,
      payloadJson: JSON.stringify({ shots: args.shots }),
      traceJson: JSON.stringify(args.trace),
    },
  });
  return toEditingPlanDto(record);
}

export async function listEditingPlans(scriptId: string): Promise<EditingPlanDto[]> {
  const records = await prisma.editingPlan.findMany({
    where: { scriptId },
    orderBy: { createdAt: 'desc' },
  });
  return records.map(toEditingPlanDto);
}

export async function getLatestEditingPlan(scriptId: string): Promise<EditingPlanDto | null> {
  const record = await prisma.editingPlan.findFirst({
    where: { scriptId },
    orderBy: { createdAt: 'desc' },
  });
  return record ? toEditingPlanDto(record) : null;
}

function toEditingPlanDto(record: {
  id: string;
  scriptId: string;
  strategy: string;
  payloadJson: string;
  traceJson: string | null;
  createdAt: Date;
}): EditingPlanDto {
  const payload = JSON.parse(record.payloadJson) as { shots: PlannedShotDto[] };
  const trace = record.traceJson ? (JSON.parse(record.traceJson) as EditingPlanDto['trace']) : [];
  return {
    id: record.id,
    scriptId: record.scriptId,
    strategy: record.strategy,
    shots: payload.shots,
    trace,
    createdAt: record.createdAt.toISOString(),
  };
}
