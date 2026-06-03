import { apiClient } from './client';

import type { EditingPlanDto, GenerateScriptReq, ScriptDto } from '@tiktop/shared';

const LIVE_AGENT_REQUEST_TIMEOUT_MS = 240_000;

export async function generateScript(req: GenerateScriptReq): Promise<ScriptDto> {
  const res = await apiClient.post<ScriptDto>('/scripts', req);
  return res.data;
}

export async function getScript(id: string): Promise<ScriptDto> {
  const res = await apiClient.get<ScriptDto>(`/scripts/${id}`);
  return res.data;
}

export async function createEditingPlan(scriptId: string): Promise<EditingPlanDto> {
  const res = await apiClient.post<EditingPlanDto>(
    `/scripts/${scriptId}/editing-plan`,
    undefined,
    { timeout: LIVE_AGENT_REQUEST_TIMEOUT_MS },
  );
  return res.data;
}

export async function listEditingPlans(scriptId: string): Promise<EditingPlanDto[]> {
  const res = await apiClient.get<EditingPlanDto[]>(`/scripts/${scriptId}/editing-plans`);
  return res.data;
}

export async function getLatestEditingPlan(scriptId: string): Promise<EditingPlanDto> {
  const res = await apiClient.get<EditingPlanDto>(`/scripts/${scriptId}/editing-plans/latest`);
  return res.data;
}

export async function getLatestEditingPlanOrNull(scriptId: string): Promise<EditingPlanDto | null> {
  try {
    return await getLatestEditingPlan(scriptId);
  } catch {
    return null;
  }
}
