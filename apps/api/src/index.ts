import { createApp } from './app';
import { env } from './env';
import { logger } from './lib/logger';
import { initStorage } from './lib/storage';

async function main() {
  await initStorage();
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, modelMode: env.MODEL_MODE }, 'api listening');
  });
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
