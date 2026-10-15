import { parseEnv } from '@zod/config';
import { createLogger } from '@zod/logger';

// Bot entry STUB (D-04): skeleton only, no gateway code.
// Boot order matches every other entrypoint: fail-fast env parse FIRST, then
// the redacting logger, then one JSON boot line. discord.js gateway wiring
// (intents, embeds, channel routing) lands in Phase 4/6; until then this
// process boots and exits clean so the workspace contract stays provable.
export function main(): void {
  const env = parseEnv();
  const log = createLogger(env.LOG_LEVEL);
  log.info({ component: 'bot' }, 'bot boot ok (skeleton: no gateway)');
  log.flush();
}

main();
