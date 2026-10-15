import { parseEnv } from '@zod/config';
import { createLogger } from '@zod/logger';
import { startSchedulerRegistry } from './registry-start.js';

// Contract-fixed entrypoint: env gate runs FIRST, then logger construction,
// then the single registry start. Job-registry wiring (plan 01-03): the cron
// timers keep the event loop alive, so this process runs until signalled.
// Missing secrets throw out of parseEnv, so the process exits non-zero naming
// the missing key before any schedule exists.
export function main(): void {
  const env = parseEnv();
  const log = createLogger(env.LOG_LEVEL);
  log.info({ component: 'scheduler' }, 'scheduler boot ok');
  startSchedulerRegistry(log);
  log.flush();
}

main();
