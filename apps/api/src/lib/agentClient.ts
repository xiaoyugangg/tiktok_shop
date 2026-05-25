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
  summary: string;
  tags: string[];
  embedding_text: string;
  embedding_vector: number[];
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

export async function callAgent<TResponse>(
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<TResponse> {
  if (!env.P1_ENABLE_AGENT) {
    throw new Error('P1 agent is disabled');
  }

  const baseUrl = env.AGENT_BASE_URL.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(env.AGENT_TIMEOUT_MS),
    ...init,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`agent ${path} failed: ${response.status} ${text}`);
  }

  return (await response.json()) as TResponse;
}
