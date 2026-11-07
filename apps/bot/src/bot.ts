// Production Discord bot composition.
//
// Ownership split (deliberate):
//   bot process      -> gateway connection, audited-row router, relay, reminders
//   scheduler process -> polling, audit drain, GC, headless bucket timers
//
// The bot must not register headless bucket timers and the scheduler must not
// open a second Discord gateway. registerDeliveryJobs() exposes only the two
// gateway-dependent jobs so both processes can share one registry module.

import { parseEnv, type Env } from '@zod/config';
import { createPbClient } from '@zod/db-hot';
import { createLogger, type Logger } from '@zod/logger';
import { startGateway, type Client } from '@zod/discord-router/gateway';
import { createRouterService, type RouterService } from '@zod/discord-router/router-service';
import { createRelayService, type RelayService } from '@zod/discord-router/relay';
import { createReminderTick } from '@zod/discord-router/reminder';
import { registerDeliveryJobs, type RegistryHandle } from '@zod/scheduler-registry';

export interface BotRuntime {
  client: Client;
  stop(): Promise<void>;
}

export interface StartBotOpts {
  env?: Env;
  log?: Logger;
  /** Injected PocketBase handle (tests). */
  pb?: unknown;
}

/**
 * Boot the gateway, the audited-row router loop, and the two delivery jobs.
 * Fails loudly on env/PocketBase errors before opening the gateway.
 */
export async function startBot(opts: StartBotOpts = {}): Promise<BotRuntime> {
  const env = opts.env ?? parseEnv();
  const log = opts.log ?? createLogger(env.LOG_LEVEL);
  const pb = opts.pb ?? (await createPbClient(env));

  const client = startGateway({
    env,
    log,
    pb,
    onLoginError: (err: unknown) => {
      log.error({ err: String(err) }, 'discord login failed — exiting bot process');
      // Let the logger flush, then fail the systemd unit so Restart=always
      // retries instead of leaving a half-alive process holding cron timers.
      setTimeout(() => process.exit(1), 250).unref();
    },
  });

  const routerService: RouterService = createRouterService({ env, log, pb, client });
  const relayService: RelayService = createRelayService({ env, log, pb, client });
  const reminderTick = createReminderTick({ env, log, pb, client });

  const deliveryJobs: RegistryHandle = registerDeliveryJobs(log, undefined, {
    pb,
    tickHandler: async (def) => {
      if (def.name === 'gateway-relay-poll') {
        await relayService.tick();
      } else if (def.name === 'gateway-reminder-tick') {
        await reminderTick('gateway-reminder-tick');
      }
    },
  });

  log.info(
    { component: 'bot', deliveryJobs: deliveryJobs.tasks.length },
    'bot boot ok: gateway + router + delivery jobs started',
  );

  return {
    client,
    async stop(): Promise<void> {
      deliveryJobs.stop();
      routerService.stop();
      relayService.stop();
      try {
        await client.destroy();
      } catch (err) {
        log.warn({ err: String(err) }, 'discord client destroy failed during shutdown');
      }
      log.flush();
    },
  };
}
