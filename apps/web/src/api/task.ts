import { apiClient } from './client';

import type { CreateTaskReq, TaskDto, TraceDto, UpdateShotReq } from '@tiktop/shared';

export async function startVideoTask(req: CreateTaskReq): Promise<TaskDto> {
  const res = await apiClient.post<TaskDto>('/tasks', req);
  return res.data;
}

export async function getTask(id: string): Promise<TaskDto> {
  const res = await apiClient.get<TaskDto>(`/tasks/${id}`);
  return res.data;
}

export async function updateShot(
  taskId: string,
  shotId: string,
  body: UpdateShotReq,
): Promise<TaskDto> {
  const res = await apiClient.patch<TaskDto>(`/tasks/${taskId}/shots/${shotId}`, body);
  return res.data;
}

export async function regenerateShot(taskId: string, shotId: string): Promise<TaskDto> {
  const res = await apiClient.post<TaskDto>(`/tasks/${taskId}/shots/${shotId}/regenerate`);
  return res.data;
}

export async function getTaskTrace(taskId: string): Promise<TraceDto[]> {
  const res = await apiClient.get<TraceDto[]>(`/tasks/${taskId}/trace`);
  return res.data;
}
