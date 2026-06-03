import { z } from 'zod';

export const RatioSchema = z.enum(['9:16', '16:9']);
export type Ratio = z.infer<typeof RatioSchema>;

export const ShotSchema = z.object({
  idx: z.number().int().min(0),
  description: z.string().min(2).max(400),
  cameraMotion: z.string().max(80).optional(),
  subtitle: z.string().max(120).optional(),
  bgmHint: z.string().max(80).optional(),
  durationSec: z.number().int().min(4).max(12),
});
export type Shot = z.infer<typeof ShotSchema>;

export const ScriptSchema = z.object({
  narrative: z.string().min(2),
  visualStyle: z.string().min(2),
  ratio: RatioSchema,
  shots: z.array(ShotSchema).min(1).max(3),
  constraints: z.array(z.string()).optional(),
});
export type Script = z.infer<typeof ScriptSchema>;

export const ProductInfoSchema = z.object({
  title: z.string().min(1).max(80),
  sellingPoints: z.array(z.string().min(1).max(60)).min(1).max(8),
  targetAudience: z.string().max(80).optional(),
  scene: z.string().max(80).optional(),
  mainMaterialId: z.string().optional(),
  ratio: RatioSchema,
});
export type ProductInfo = z.infer<typeof ProductInfoSchema>;
