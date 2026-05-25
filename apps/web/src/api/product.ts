import { apiClient } from './client';

import type { CreateProductReq, ProductDto } from '@tiktop/shared';

export async function createProduct(req: CreateProductReq): Promise<ProductDto> {
  const res = await apiClient.post<ProductDto>('/products', req);
  return res.data;
}

export async function listProducts(): Promise<ProductDto[]> {
  const res = await apiClient.get<ProductDto[]>('/products');
  return res.data;
}
