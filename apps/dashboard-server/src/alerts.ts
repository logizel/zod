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
