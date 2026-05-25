import { GenerateScriptReqSchema } from '@tiktop/shared';
import { Router } from 'express';

import { createScriptForProduct, getScript } from './script.service';

export const scriptRouter: Router = Router();

scriptRouter.post('/', async (req, res, next) => {
  try {
    const parsed = GenerateScriptReqSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'invalid request', issues: parsed.error.issues });
      return;
    }
    const dto = await createScriptForProduct(parsed.data);
    res.status(201).json(dto);
  } catch (err) {
    next(err);
  }
});

scriptRouter.get('/:id', async (req, res, next) => {
  try {
    const dto = await getScript(req.params.id);
    if (!dto) {
      res.status(404).json({ message: 'script not found' });
      return;
    }
    res.json(dto);
  } catch (err) {
    next(err);
  }
});
