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
});
export type GenerateScriptReq = z.infer<typeof GenerateScriptReqSchema>;

export const ScriptDtoSchema = z.object({
  id: z.string(),
  productId: z.string(),
  payload: ScriptSchema,
  createdAt: z.string(),
});
export type ScriptDto = z.infer<typeof ScriptDtoSchema>;

export const CreateTaskReqSchema = z.object({
  scriptId: z.string(),
  ratio: RatioSchema,
});
export type CreateTaskReq = z.infer<typeof CreateTaskReqSchema>;

export const ShotDtoSchema = z.object({
  id: z.string(),
  idx: z.number().int(),
  description: z.string(),
  cameraMotion: z.string(),
  durationSec: z.number(),
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
  ratio: RatioSchema,
  status: TaskStatusSchema,
  errorMsg: z.string().nullable().optional(),
  outputUrl: z.string().nullable().optional(),
  shots: z.array(ShotDtoSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskDto = z.infer<typeof TaskDtoSchema>;
