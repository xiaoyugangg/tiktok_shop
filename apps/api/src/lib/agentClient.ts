import { env } from '../env';

export interface AgentTraceItem {
  stage: string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface AgentHealthResponse {
  ok: boolean;
  service: string;
  model_mode: string;
}

export interface MaterialAnalyzeResponse {
  material_id: string;
  caption?: string | null;
  summary: string;
  tags: string[];
  embedding_text: string;
  embedding_vector: number[];
  embedding_model?: string | null;
  trace: AgentTraceItem[];
}

export interface EditingPlanResponse {
  shots: Array<{
    idx: number;
    prompt: string;
    subtitle: string;
    bgm_hint: string;
    duration_sec: number;
    source_material_id: string | null;
    reason: string;
  }>;
  strategy: string;
  trace: AgentTraceItem[];
}

export interface RetryDecisionResponse {
  should_retry: boolean;
  reason: string;
  patch?: {
    prompt?: string | null;
    duration_sec?: number | null;
  };
  trace: AgentTraceItem[];
}

export interface PostprocessResponse {
  output_path: string;
  subtitle_path?: string | null;
  trace: AgentTraceItem[];
}

export interface ScriptGenerateResponse {
  narrative: string;
  visual_style: string;
  ratio: '9:16' | '16:9';
  shots: Array<{
    idx: number;
    description: string;
    camera_motion: string;
    subtitle: string;
    bgm_hint: string;
    duration_sec: number;
  }>;
  constraints: string[];
  trace: AgentTraceItem[];
}

export interface ReferenceVideoAnalysisResponse {
  reference_video_id: string;
  summary: string;
  hook_type: string;
  pain_point: string;
  selling_points: string[];
  shot_structure: string[];
  visual_style: string;
  subtitle_style: string;
  bgm_rhythm: string;
  cta_pattern: string;
  reusable_template: string;
  keyframe_captions: string[];
  trace: AgentTraceItem[];
}

export interface PipelineRunResponse {
  task_id: string;
  status: 'succeeded' | 'failed';
  output_path?: string | null;
  error_message?: string | null;
  trace: AgentTraceItem[];
}

export async function callAgent<TResponse>(
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<TResponse> {
  if (!env.P1_ENABLE_AGENT) {
    throw new Error('P1 agent is disabled');
  }

  const baseUrl = env.AGENT_BASE_URL.replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: init?.signal ?? AbortSignal.timeout(env.AGENT_TIMEOUT_MS),
    });
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : '';
    throw new Error(`agent ${path} fetch failed${cause}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`agent ${path} failed: ${response.status} ${text}`);
  }

  return (await response.json()) as TResponse;
}
