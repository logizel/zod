// #🛠-ops-health Discord alerts (D-15, Pitfall 14).
//
// sendOpsAlert(text) resolves the #🛠-ops-health Discord channel using the
// CHANNEL_ID_ENV_KEYS pattern: env-ID-first (DISCORD_CHANNEL_OPS_HEALTH),
// then exact-name fallback. Used for GC summaries/failures, tunnel up/down
// transitions, watchdog heartbeats, and VM idle-reclaim alerts.
// Secrets stay in env only — never logged, never embedded in alert text.

import type { Env } from '@zod/config';

export interface AlertDeps {
  env: Env;
  client: any; // discord.js Client (injected for tests)
  log: {
    warn: (...args: any[]) => void;
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

const OPS_HEALTH_CHANNEL = '#🛠-ops-health';

/** Resolve the ops-health channel: env-ID-first, then name fallback. */
async function resolveOpsHealthChannel(
  env: Env,
  client: any,
): Promise<any | null> {
  if (!client) return null;

  // 1. Env-ID-first: DISCORD_CHANNEL_OPS_HEALTH -> channel ID -> fetch
  const channelId = env.DISCORD_CHANNEL_OPS_HEALTH;
  if (channelId) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && typeof channel.isTextBased === 'function' && channel.isTextBased() && !channel.isDMBased()) {
        return channel;
      }
    } catch {
      // fall through to name-based resolution
    }
  }

  // 2. Name fallback: search guild channels for ops-health by name
  const guilds = client.guilds?.cache?.values?.() ?? [];
  for (const guild of guilds) {
    const channels = guild.channels?.cache?.values?.() ?? [];
    const named = [...channels].find(
      (c: any) =>
        typeof c.isTextBased === 'function' &&
        c.isTextBased() &&
        !c.isDMBased() &&
        (c.name === '🛠-ops-health' || c.name === 'ops-health'),
    );
    if (named) return named;
  }
  return null;
}

/**
 * Send an ops-health alert to Discord #🛠-ops-health.
 * Returns true on success, false on failure (never throws).
 */
export async function sendOpsAlert(
  text: string,
  deps: AlertDeps,
): Promise<boolean> {
  const { env, client, log } = deps;

  if (!client) {
    log.warn({ channel: OPS_HEALTH_CHANNEL }, 'discord client not ready; ops alert skipped');
    return false;
  }

  const channel = await resolveOpsHealthChannel(env, client);

  if (!channel) {
    log.warn({ channel: OPS_HEALTH_CHANNEL }, 'ops-health channel not found; alert not sent');
    return false;
  }

  try {
    await channel.send({ content: text });
    log.info({ channel: OPS_HEALTH_CHANNEL }, 'ops alert sent');
    return true;
  } catch (err) {
    log.error({ error: (err as Error).message }, 'failed to send ops alert');
    return false;
  }
}

// ---------------------------------------------------------------------------
// REST-only ops alerts for headless processes (scheduler GC)
// ---------------------------------------------------------------------------
//
// The scheduler process must never open a Discord gateway (the bot owns the
// single gateway connection), but ops alerts still need to reach
// #🛠-ops-health. This sender uses the Discord REST API with the bot token:
// env-ID-first, then a cached guild-channel name lookup.

interface RestFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

interface RestFetchLike {
  (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<RestFetchResponse>;
}

export interface RestAlertDeps {
  env: Env;
  log: {
    warn: (...args: any[]) => void;
    info: (...args: any[]) => void;
    error?: (...args: any[]) => void;
  };
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: RestFetchLike;
  /** Discord API base override (tests). */
  apiBase?: string;
}

/**
 * Build a REST-backed ops-health alert sender.
 * Returns true only when Discord accepted the message; never throws.
 */
export function createOpsAlertSender(deps: RestAlertDeps): (text: string) => Promise<boolean> {
  const { env, log } = deps;
  const apiBase = deps.apiBase ?? 'https://discord.com/api/v10';
  const fetchImpl = deps.fetchImpl ?? (globalThis.fetch as unknown as RestFetchLike | undefined);

  let channelId = env.DISCORD_CHANNEL_OPS_HEALTH || '';
  let resolving: Promise<string | null> | null = null;

  const headers = (): Record<string, string> => ({
    Authorization: `Bot ${env.DISCORD_TOKEN}`,
    'Content-Type': 'application/json',
  });

  async function resolveByGuildName(): Promise<string | null> {
    if (!fetchImpl) return null;
    try {
      const guildsRes = await fetchImpl(`${apiBase}/users/@me/guilds`, { headers: headers() });
      if (!guildsRes.ok) {
        log.warn({ status: guildsRes.status, channel: OPS_HEALTH_CHANNEL }, 'ops-health guild lookup failed');
        return null;
      }
      const guilds = (await guildsRes.json()) as Array<{ id?: string }>;
      for (const guild of guilds) {
        if (!guild.id) continue;
        const channelsRes = await fetchImpl(`${apiBase}/guilds/${guild.id}/channels`, {
          headers: headers(),
        });
        if (!channelsRes.ok) continue;
        const channels = (await channelsRes.json()) as Array<{
          id?: string;
          name?: string;
          type?: number;
        }>;
        const named = channels.find(
          (c) =>
            (c.type === 0 || c.type === 5) &&
            (c.name === '🛠-ops-health' || c.name === 'ops-health' || c.name === '🛠️-ops-health'),
        );
        if (named?.id) return named.id;
      }
    } catch (err) {
      log.warn({ err: String(err), channel: OPS_HEALTH_CHANNEL }, 'ops-health REST channel lookup failed');
    }
    return null;
  }

  return async (text: string): Promise<boolean> => {
    if (!fetchImpl) {
      log.warn({ channel: OPS_HEALTH_CHANNEL }, 'fetch unavailable; ops alert skipped');
      return false;
    }
    if (!env.DISCORD_TOKEN) {
      log.warn({ channel: OPS_HEALTH_CHANNEL }, 'discord token missing; ops alert skipped');
      return false;
    }
    if (!channelId) {
      resolving ??= resolveByGuildName();
      channelId = (await resolving) ?? '';
      resolving = null;
    }
    if (!channelId) {
      log.warn({ channel: OPS_HEALTH_CHANNEL }, 'ops-health channel not found; alert not sent');
      return false;
    }

    try {
      const res = await fetchImpl(`${apiBase}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        log.warn({ status: res.status, channel: OPS_HEALTH_CHANNEL }, 'ops alert rejected by Discord');
        return false;
      }
      log.info({ channel: OPS_HEALTH_CHANNEL }, 'ops alert sent (REST)');
      return true;
    } catch (err) {
      log.error?.({ err: String(err), channel: OPS_HEALTH_CHANNEL }, 'failed to send ops alert (REST)');      return false;
    }
  };
}
