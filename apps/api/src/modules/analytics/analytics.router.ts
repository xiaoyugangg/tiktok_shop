import { Router } from 'express';

import { callAgent } from '../../lib/agentClient';

export const analyticsRouter: Router = Router();

analyticsRouter.get('/mock', async (_req, res, next) => {
  try {
    const data = await callAgent('/analytics/mock', { task_count: 8 });
    res.json(data);
  } catch (err) {
    next(err);
  }
});
