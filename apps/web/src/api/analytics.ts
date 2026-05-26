import { apiClient } from './client';

export interface AnalyticsMetric {
  factor: string;
  ctr: number;
  cvr: number;
  completion_rate: number;
}

export interface AnalyticsResponse {
  metrics: AnalyticsMetric[];
  insights: string[];
  trace?: Array<{
    stage: string;
    message: string;
    payload?: Record<string, unknown>;
  }>;
}

export async function getMockAnalytics(): Promise<AnalyticsResponse> {
  const res = await apiClient.get<AnalyticsResponse>('/analytics/mock');
  return res.data;
}
