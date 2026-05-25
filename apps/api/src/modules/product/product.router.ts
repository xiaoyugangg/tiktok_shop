import { CreateProductReqSchema } from '@tiktop/shared';
import { Router } from 'express';

import { createProduct, getProduct, listProducts } from './product.service';

export const productRouter: Router = Router();

productRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await listProducts());
  } catch (err) {
    next(err);
  }
});

productRouter.get('/:id', async (req, res, next) => {
  try {
    const dto = await getProduct(req.params.id);
    if (!dto) {
      res.status(404).json({ message: 'product not found' });
      return;
    }
    res.json(dto);
  } catch (err) {
    next(err);
  }
});

productRouter.post('/', async (req, res, next) => {
  try {
    const parsed = CreateProductReqSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'invalid product', issues: parsed.error.issues });
      return;
    }
    const dto = await createProduct(parsed.data);
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
});
