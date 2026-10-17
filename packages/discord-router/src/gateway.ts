import { Client, GatewayIntentBits, Partials } from 'discord.js';
import type { Env } from '@zod/config';
import { createLogger } from '@zod/logger';
import { startBookmarkHandler } from './bookmark.js';

// Gateway-intent contract (D-09 prerequisite, Pitfall 2):
//   GuildMessages = 512   — receive guild message events
//   MessageContent = 32768 — PRIVILEGED: must be enabled in Discord dev portal
let clientInstance: Client | null = null;

export type { Client };

export interface GatewayDeps {
  env: Env;
  log: ReturnType<typeof createLogger>;
}

export function startGateway({ env, log }: GatewayDeps): Client {
  const client = new Client({
    intents: [
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
    partials: [Partials.Message, Partials.Reaction, Partials.Channel],
  });

  client.on('ready', () => {
    log.info({ tag: client.user?.tag }, 'Logged in as <bot-tag>');
  });

  client.on('error', (err) => {
    log.error({ err: String(err) }, 'discord gateway error');
  });

  // Login is deliberate: parseEnv at entrypoint already threw if DISCORD_TOKEN
  // is missing, so env.DISCORD_TOKEN is guaranteed present here.
  void client.login(env.DISCORD_TOKEN).catch((err) => {
    log.error({ err: String(err) }, 'discord login failed');
  });

  // Start bookmark reaction handler at boot (UI-02, D-05).
  // Listens for messageReactionAdd with the custom bookmark emoji.
  startBookmarkHandler({ env, log });

  clientInstance = client;
  return client;
}

/** Retrieve the gateway's discord.js Client (null until login completes). */
export function getClient(): Client | null {
  return clientInstance;
}
