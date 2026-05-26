import { apiClient } from './client';

import type { MaterialDto } from '@tiktop/shared';

export async function listMaterials(productId?: string): Promise<MaterialDto[]> {
  const res = await apiClient.get<MaterialDto[]>('/materials', {
    params: productId ? { productId } : undefined,
  });
  return res.data;
}

export async function uploadMaterial(file: File, productId?: string): Promise<MaterialDto> {
  const form = new FormData();
  form.append('file', file);
  if (productId) form.append('productId', productId);
  const res = await apiClient.post<MaterialDto>('/materials', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deleteMaterial(id: string): Promise<void> {
  await apiClient.delete(`/materials/${id}`);
}

export async function analyzeMaterial(id: string): Promise<MaterialDto> {
  const res = await apiClient.post<MaterialDto>(`/materials/${id}/analyze`);
  return res.data;
}
