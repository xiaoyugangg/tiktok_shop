import { apiClient } from './client';

import type { GenerateScriptReq, ScriptDto } from '@tiktop/shared';

export async function generateScript(req: GenerateScriptReq): Promise<ScriptDto> {
  const res = await apiClient.post<ScriptDto>('/scripts', req);
  return res.data;
}

export async function getScript(id: string): Promise<ScriptDto> {
  const res = await apiClient.get<ScriptDto>(`/scripts/${id}`);
  return res.data;
}
