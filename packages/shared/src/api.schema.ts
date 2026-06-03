import { z } from 'zod';

import { ProductInfoSchema, RatioSchema, ScriptSchema } from './script.schema';
import { ShotStatusSchema, TaskStatusSchema } from './task.schema';

export const MaterialDtoSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video']),
  filename: z.string(),
  url: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  caption: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  embeddingText: z.string().nullable().optional(),
  embeddingModel: z.string().nullable().optional(),
  analyzedAt: z.string().nullable().optional(),
  productId: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type MaterialDto = z.infer<typeof MaterialDtoSchema>;

export const CreateProductReqSchema = ProductInfoSchema;
export type CreateProductReq = z.infer<typeof CreateProductReqSchema>;

export const ProductDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  sellingPoints: z.array(z.string()),
  targetAudience: z.string().nullable().optional(),
  scene: z.string().nullable().optional(),
  mainMaterialId: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type ProductDto = z.infer<typeof ProductDtoSchema>;

export const GenerateScriptReqSchema = z.object({
  productId: z.string(),
  ratio: RatioSchema.optional(),
  referenceAnalysisId: z.string().optional(),
});
export type GenerateScriptReq = z.infer<typeof GenerateScriptReqSchema>;

export const ScriptDtoSchema = z.object({
  id: z.string(),
  productId: z.string(),
  referenceAnalysisId: z.string().nullable().optional(),
  payload: ScriptSchema,
  createdAt: z.string(),
});
export type ScriptDto = z.infer<typeof ScriptDtoSchema>;

export const AgentTraceItemSchema = z.object({
  stage: z.string(),
  message: z.string(),
  payload: z.record(z.unknown()).optional(),
});
export type AgentTraceItem = z.infer<typeof AgentTraceItemSchema>;

export const PlannedShotDtoSchema = z.object({
  idx: z.number().int(),
  prompt: z.string(),
  subtitle: z.string(),
  bgmHint: z.string(),
  durationSec: z.number(),
  sourceMaterialId: z.string().nullable().optional(),
  reason: z.string(),
});
export type PlannedShotDto = z.infer<typeof PlannedShotDtoSchema>;

export const EditingPlanDtoSchema = z.object({
  id: z.string(),
  scriptId: z.string(),
  shots: z.array(PlannedShotDtoSchema),
  strategy: z.string(),
  trace: z.array(AgentTraceItemSchema),
  createdAt: z.string(),
});
export type EditingPlanDto = z.infer<typeof EditingPlanDtoSchema>;

export const CreateTaskReqSchema = z.object({
  scriptId: z.string(),
  ratio: RatioSchema,
  editingPlanId: z.string().optional(),
});
export type CreateTaskReq = z.infer<typeof CreateTaskReqSchema>;

export const ShotDtoSchema = z.object({
  id: z.string(),
  idx: z.number().int(),
  description: z.string(),
  cameraMotion: z.string(),
  durationSec: z.number(),
  prompt: z.string().nullable().optional(),
  subtitle: z.string().nullable().optional(),
  bgmHint: z.string().nullable().optional(),
  sourceMaterialId: z.string().nullable().optional(),
  retryCount: z.number().int().nonnegative().optional(),
  status: ShotStatusSchema,
  imageUrl: z.string().nullable().optional(),
  clipUrl: z.string().nullable().optional(),
  errorMsg: z.string().nullable().optional(),
});
export type ShotDto = z.infer<typeof ShotDtoSchema>;

export const TaskDtoSchema = z.object({
  id: z.string(),
  productId: z.string(),
  scriptId: z.string(),
  editingPlanId: z.string().nullable().optional(),
  editingPlan: EditingPlanDtoSchema.nullable().optional(),
  ratio: RatioSchema,
  status: TaskStatusSchema,
  errorMsg: z.string().nullable().optional(),
  outputUrl: z.string().nullable().optional(),
  shots: z.array(ShotDtoSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskDto = z.infer<typeof TaskDtoSchema>;

export const UpdateShotReqSchema = z.object({
  description: z.string().min(2).max(400).optional(),
  cameraMotion: z.string().max(80).optional(),
  prompt: z.string().max(800).optional(),
  subtitle: z.string().max(120).optional(),
  bgmHint: z.string().max(80).optional(),
  durationSec: z.number().int().min(4).max(12).optional(),
  sourceMaterialId: z.string().nullable().optional(),
});
export type UpdateShotReq = z.infer<typeof UpdateShotReqSchema>;

export const TraceDtoSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  shotId: z.string().nullable().optional(),
  stage: z.string(),
  level: z.string(),
  message: z.string(),
  payload: z.record(z.unknown()).optional(),
  createdAt: z.string(),
});
export type TraceDto = z.infer<typeof TraceDtoSchema>;

export const ReferenceVideoAnalysisDtoSchema = z.object({
  id: z.string(),
  referenceVideoId: z.string(),
  summary: z.string(),
  hookType: z.string(),
  painPoint: z.string(),
  sellingPoints: z.array(z.string()),
  shotStructure: z.array(z.string()),
  visualStyle: z.string(),
  subtitleStyle: z.string(),
  bgmRhythm: z.string(),
  ctaPattern: z.string(),
  reusableTemplate: z.string(),
  keyframeCaptions: z.array(z.string()),
  trace: z.array(AgentTraceItemSchema),
  createdAt: z.string(),
});
export type ReferenceVideoAnalysisDto = z.infer<typeof ReferenceVideoAnalysisDtoSchema>;

export const ReferenceVideoDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceType: z.enum(['upload', 'url', 'manual']),
  sourceUrl: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  mime: z.string().nullable().optional(),
  size: z.number().int().nullable().optional(),
  category: z.string().nullable().optional(),
  keywords: z.array(z.string()),
  latestAnalysis: ReferenceVideoAnalysisDtoSchema.nullable().optional(),
  createdAt: z.string(),
});
export type ReferenceVideoDto = z.infer<typeof ReferenceVideoDtoSchema>;

export const CreateReferenceVideoReqSchema = z.object({
  title: z.string().min(1).max(120),
  sourceUrl: z.string().url().optional(),
  category: z.string().max(40).optional(),
  keywords: z.array(z.string().max(30)).max(12).optional(),
});
export type CreateReferenceVideoReq = z.infer<typeof CreateReferenceVideoReqSchema>;
