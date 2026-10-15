import { parseEnv } from '@zod/config';
import { createLogger } from '@zod/logger';

// Contract-fixed entrypoint: env gate runs FIRST, then logger construction,
// then a single JSON boot line and clean exit.
// Job-registry wiring lands with the scheduler plan (01-03); this stub proves
// the boot path end to end. Missing secrets throw out of parseEnv, so the
// process exits non-zero naming the missing key.
export function main(): void {
  const env = parseEnv();
  const log = createLogger(env.LOG_LEVEL);
  log.info({ component: 'scheduler' }, 'scheduler boot ok');
  log.flush();
}

main();
