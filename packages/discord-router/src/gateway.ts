import { Client, GatewayIntentBits, Partials } from 'discord.js';
import type { Env } from '@zod/config';
import { createLogger } from '@zod/logger';
import { createTursoClient, clientExecutor, type StatementExecutor } from '@zod/db-cold';
import { startBookmarkHandler } from './bookmark.js';
import { startTasteIngestion } from './taste-ingest.js';

// Gateway-intent contract (D-09 prerequisite, Pitfall 2):
//   GuildMessages = 512   — receive guild message events
//   MessageContent = 32768 — PRIVILEGED: must be enabled in Discord dev portal
let clientInstance: Client | null = null;

export type { Client };

export interface GatewayDeps {
  env: Env;
  log: ReturnType<typeof createLogger>;
  /** Shared PocketBase client for bookmark/taste handlers (optional in tests). */
  pb?: unknown;
  /** Cold Turso executor for taste-rule writes (primary). Constructed from env when omitted. */
  cold?: StatementExecutor;
  /** Called when Discord login fails so the process can exit non-zero. */
  onLoginError?: (err: unknown) => void;
}

export function startGateway({ env, log, pb, cold, onLoginError }: GatewayDeps): Client {
  const client = new Client({
    intents: [
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
    partials: [Partials.Message, Partials.Reaction, Partials.Channel],
  });

  clientInstance = client;

  // Cold Turso executor for taste-rule writes (Turso primary, PB fallback).
  const coldExecutor = cold ?? (() => {
    try {
      return clientExecutor(createTursoClient(env));
    } catch {
      return undefined;
    }
  })();

  client.once('ready', () => {
    log.info({ tag: client.user?.tag }, `Logged in as ${client.user?.tag ?? 'unknown'}`);

    // Start handlers only after the gateway is ready. Starting them during
    // login leaves listeners racing the first ready and can miss early events.
    // Bookmark reaction handler (UI-02, D-05).
    startBookmarkHandler({ env, log, pb });
    // Taste rule ingestion (MEM-04, D-11): reaction, !rule, and DM paths.
    // Cold Turso primary with PocketBase fallback.
    startTasteIngestion({ env, log, pb, cold: coldExecutor });
  });

  client.on('error', (err) => {
    log.error({ err: String(err) }, 'discord gateway error');
  });

  // Login is deliberate: parseEnv at entrypoint already threw if DISCORD_TOKEN
  // is missing, so env.DISCORD_TOKEN is guaranteed present here.
  void client.login(env.DISCORD_TOKEN).catch((err) => {
    log.error({ err: String(err) }, 'discord login failed');
    onLoginError?.(err);
  });

  return client;
}

/** Retrieve the gateway's discord.js Client (null until login completes). */
export function getClient(): Client | null {
  return clientInstance;
}
