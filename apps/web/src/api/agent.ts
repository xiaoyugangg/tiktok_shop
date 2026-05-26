import { apiClient } from './client';

export interface AgentHealth {
  ok: boolean;
  service: string;
  modelMode: string;
}

export async function getAgentHealth(): Promise<AgentHealth> {
  const res = await apiClient.get<AgentHealth>('/agent/health');
  return res.data;
}
