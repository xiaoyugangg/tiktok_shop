import { CreateReferenceVideoReqSchema } from '@tiktop/shared';
import { Router } from 'express';
import multer from 'multer';

import {
  analyzeReferenceVideo,
  createReferenceVideo,
  listReferenceVideos,
  uploadReferenceVideo,
} from './reference.service';

export const referenceRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 },
});

referenceRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await listReferenceVideos());
  } catch (err) {
    next(err);
  }
});

referenceRouter.post('/', async (req, res, next) => {
  try {
    const parsed = CreateReferenceVideoReqSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'invalid reference video', issues: parsed.error.issues });
      return;
    }
    res.status(201).json(await createReferenceVideo(parsed.data));
  } catch (err) {
    next(err);
  }
});

referenceRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'file field is required' });
      return;
    }
    const keywords =
      typeof req.body.keywords === 'string'
        ? req.body.keywords
            .split(/[,，;；]/)
            .map((item: string) => item.trim())
            .filter(Boolean)
        : [];
    const dto = await uploadReferenceVideo({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mime: req.file.mimetype,
      title: typeof req.body.title === 'string' ? req.body.title : undefined,
      category: typeof req.body.category === 'string' ? req.body.category : undefined,
      keywords,
    });
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
});

referenceRouter.post('/:id/analyze', async (req, res, next) => {
  try {
    const dto = await analyzeReferenceVideo(req.params.id);
    if (!dto) {
      res.status(404).json({ message: 'reference video not found' });
      return;
    }
    res.json(dto);
  } catch (err) {
    next(err);
  }
});
