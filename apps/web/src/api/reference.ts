import { apiClient } from './client';

import type { CreateReferenceVideoReq, ReferenceVideoDto } from '@tiktop/shared';

const REFERENCE_ANALYZE_TIMEOUT_MS = 240_000;

export async function listReferenceVideos(): Promise<ReferenceVideoDto[]> {
  const res = await apiClient.get<ReferenceVideoDto[]>('/references');
  return res.data;
}

export async function createReferenceVideo(req: CreateReferenceVideoReq): Promise<ReferenceVideoDto> {
  const res = await apiClient.post<ReferenceVideoDto>('/references', req);
  return res.data;
}

export async function uploadReferenceVideo(formData: FormData): Promise<ReferenceVideoDto> {
  const res = await apiClient.post<ReferenceVideoDto>('/references/upload', formData, {
    headers: { 'content-type': 'multipart/form-data' },
  });
  return res.data;
}

export async function analyzeReferenceVideo(id: string): Promise<ReferenceVideoDto> {
  const res = await apiClient.post<ReferenceVideoDto>(`/references/${id}/analyze`, undefined, {
    timeout: REFERENCE_ANALYZE_TIMEOUT_MS,
  });
  return res.data;
}
