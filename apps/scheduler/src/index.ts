import { parseEnv } from '@zod/config';
import { createLogger } from '@zod/logger';
import { startSchedulerRegistry } from './registry-start.js';

// Contract-fixed entrypoint: env gate runs FIRST, then logger construction,
// then the single registry start. Job-registry wiring (plan 01-03): the cron
// timers keep the event loop alive, so this process runs until signalled.
// Missing secrets throw out of parseEnv, so the process exits non-zero naming
// the missing key before any schedule exists.
export async function main(): Promise<void> {
  const env = parseEnv();
  const log = createLogger(env.LOG_LEVEL);
  log.info({ component: 'scheduler' }, 'scheduler boot ok');

  const handle = await startSchedulerRegistry(log);

  const shutdown = (signal: string): void => {
    log.info({ component: 'scheduler', signal }, 'scheduler stopping');
    handle.stop();
    log.flush();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  log.flush();
}

main().catch((err: unknown) => {
  // parseEnv / PB auth failures must fail fast and visibly.
  console.error('scheduler boot failed', err);
  process.exit(1);
});
