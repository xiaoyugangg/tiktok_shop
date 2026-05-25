import { Router } from 'express';

import { callAgent, type AgentHealthResponse } from '../../lib/agentClient';

export const agentRouter: Router = Router();

agentRouter.get('/health', async (_req, res, next) => {
  try {
    const health = await callAgent<AgentHealthResponse>('/health');
    res.json({
      ok: health.ok,
      service: health.service,
      modelMode: health.model_mode,
    });
  } catch (err) {
    next(err);
  }
});
