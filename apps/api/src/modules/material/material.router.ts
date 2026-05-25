import { Router } from 'express';
import multer from 'multer';

import { logger } from '../../lib/logger';

import { deleteMaterial, listMaterials, saveUploadedMaterial } from './material.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

export const materialRouter: Router = Router();

materialRouter.get('/', async (req, res, next) => {
  try {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
    const list = await listMaterials({ productId });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

materialRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'file field is required' });
      return;
    }
    const productId = typeof req.body.productId === 'string' ? req.body.productId : undefined;
    const dto = await saveUploadedMaterial({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mime: req.file.mimetype,
      productId,
    });
    logger.info({ materialId: dto.id, size: dto.size }, 'material uploaded');
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
});

materialRouter.delete('/:id', async (req, res, next) => {
  try {
    await deleteMaterial(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
