import { Router } from 'express';

import { listTrace } from './trace.service';

export const traceRouter: Router = Router();

traceRouter.get('/tasks/:taskId/trace', async (req, res, next) => {
  try {
    res.json(await listTrace(req.params.taskId));
  } catch (err) {
    next(err);
  }
});
