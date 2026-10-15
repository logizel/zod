import { parseEnv } from '@zod/config';
import { createLogger } from '@zod/logger';
import { startGateway } from './gateway.js';
import { startRouterService } from './router-service.js';

// Bot entry: fail-fast env parse FIRST, then the redacting logger, then
// gateway + router service boot. Missing DISCORD_TOKEN throws out of parseEnv
// before any discord.js Client constructs.
export function main(): void {
  const env = parseEnv();
  const log = createLogger(env.LOG_LEVEL);
  log.info({ component: 'discord-router' }, 'discord-router boot ok');
  startGateway({ env, log });
  startRouterService({ env, log });
  log.flush();
}

main();
