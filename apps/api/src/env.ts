import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  WEB_PORT: z.coerce.number().int().positive().default(5173),
  DATABASE_URL: z.string().default('file:./dev.db'),
  STORAGE_ROOT: z.string().default('./storage'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:8787'),
  MODEL_MODE: z.enum(['mock', 'live']).default('mock'),
  AGENT_BASE_URL: z.string().url().default('http://127.0.0.1:8790'),
  AGENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  P1_ENABLE_AGENT: z.coerce.boolean().default(true),
  P1_ENABLE_SUBTITLE: z.coerce.boolean().default(true),
  P1_ENABLE_BGM: z.coerce.boolean().default(false),
  P1_ENABLE_TTS: z.coerce.boolean().default(false),
  ARK_API_KEY: z.string().optional(),
  ARK_BASE_URL: z.string().default('https://ark.cn-beijing.volces.com/api/v3'),
  ARK_TEXT_MODEL: z.string().optional(),
  ARK_VIDEO_MODEL: z.string().optional(),
  ARK_VIDEO_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(4000),
  ARK_VIDEO_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
});

export const env = EnvSchema.parse(process.env);

export type Env = z.infer<typeof EnvSchema>;
