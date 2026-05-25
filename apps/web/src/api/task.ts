import { apiClient } from './client';

import type { CreateTaskReq, TaskDto } from '@tiktop/shared';

export async function startVideoTask(req: CreateTaskReq): Promise<TaskDto> {
  const res = await apiClient.post<TaskDto>('/tasks', req);
  return res.data;
}

export async function getTask(id: string): Promise<TaskDto> {
  const res = await apiClient.get<TaskDto>(`/tasks/${id}`);
  return res.data;
}
