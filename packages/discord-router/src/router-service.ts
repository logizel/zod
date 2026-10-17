import type { Env } from '@zod/config';
import { createLogger, type Logger } from '@zod/logger';
import type { OpportunityRow } from '@zod/db-hot/schema';
import { buildAuditCard } from './embed.js';
import { getClient } from './gateway.js';
import { recordFailure } from '@zod/db-hot/scratchpad';
import { createPbClient } from '@zod/db-hot';

export interface RouterServiceDeps {
  env: Env;
  log: ReturnType<typeof createLogger>;
  /** Injected PocketBase client (tests inject a mock). */
  pb?: any;
  /** Injected discord.js Client (tests inject a mock). */
  client?: any;
}

export interface RouterService {
  stop(): void;
}

/**
 * Process a single audited opportunity: build embed, send to Discord channel,
 * then mark status='routed'. Returns true on success, false on failure.
 * Tests call this directly with mocked pb + client.
 */
export async function processOpportunity(
  pb: any,
  env: Env,
  client: any,
  opportunity: OpportunityRow,
  log: Pick<Logger, 'warn' | 'info' | 'error'>,
): Promise<boolean> {
  const embed = buildAuditCard(opportunity);
  const channel = await resolveChannel(env, client, opportunity.bucket_channel);
  if (!channel) {
    log.warn({ channel: opportunity.bucket_channel, id: opportunity.id }, 'channel not found; skipping post');
    return false;
  }
  try {
    const sentMessage = await channel.send({ embeds: [embed] });
    await pb.collection('opportunities').update(opportunity.id, {
      status: 'routed',
      discord_message_id: sentMessage.id,
    });
    return true;
  } catch (err) {
    try {
      const { attempts, tombstoned } = await recordFailure(pb, opportunity.id, String(err));
      log.warn(
        { id: opportunity.id, attempts, tombstoned, error: String(err) },
        'discord post failed; recordFailure applied',
      );
    } catch (inner) {
      log.warn({ id: opportunity.id, error: String(inner) }, 'recordFailure itself failed');
    }
    return false;
  }
}

/** Create a router service with injected dependencies (testable). */
export function createRouterService(deps: RouterServiceDeps): RouterService {
  const { env, log, pb: pbDeps, client: clientDeps } = deps;
  const pbLog = log.child({ component: 'discord-router/router-service' });
  const pollIntervalMs = 60_000;

  let pbPromise: Promise<any> | null = null;
  const getPb = async () => {
    if (!pbPromise) {
      pbPromise = createPbClient(env);
    }
    return pbPromise;
  };

  const pollLoop = async (): Promise<void> => {
    while (true) {
      try {
        const pb = pbDeps ?? (await getPb());
        const page = await pb.collection('opportunities').getList(1, 50, {
          sort: '-created',
          filter: "status = 'audited' && bucket_channel != ''",
        });

        for (const opp of page.items) {
          try {
            const opportunity = opp as unknown as OpportunityRow;
            const client = clientDeps ?? getClient();
            if (!client) {
              pbLog.warn({ id: opportunity.id }, 'discord client not ready; deferring post');
              continue;
            }
            const ok = await processOpportunity(pb, env, client, opportunity, pbLog);
            if (!ok) {
              continue;
            }
          } catch (err) {
            const id = (opp as { id?: string }).id ?? 'unknown';
            const pbForFailure = pbDeps ?? (await getPb());
            try {
              const { attempts, tombstoned } = await recordFailure(pbForFailure, id, String(err));
              pbLog.warn(
                { id, attempts, tombstoned, error: String(err) },
                'discord post failed; recordFailure applied',
              );
            } catch (inner) {
              pbLog.warn({ id, error: String(inner) }, 'recordFailure itself failed');
            }
          }
        }
      } catch (err) {
        pbLog.warn({ error: String(err) }, 'poll loop iteration threw');
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  };

  void pollLoop().catch((err) => {
    pbLog.error({ err: String(err) }, 'router service poll loop exited');
  });

  return {
    stop: () => {
      // no-op: loop runs until process exit
    },
  };
}

/** Start the router service (entrypoint usage: creates deps from env + log). */
export function startRouterService({ env, log }: { env: Env; log: Logger }): void {
  void createRouterService({ env, log });
}

// D-14 / Pitfall 8: bucket-channel value → env key for the three new buckets.
// Env-configured Discord channel IDs are resolved first; exact-name matching
// is preserved as fallback. Unknown/unresolvable channels keep the skip path.
const CHANNEL_ID_ENV_KEYS: Record<string, keyof Env> = {
  '#⚙️-jobs-sys-cloud-devops': 'DISCORD_CHANNEL_JOBS_SYS_CLOUD',
  '#💼-jobs-general-swe': 'DISCORD_CHANNEL_JOBS_GENERAL',
  '#🎁-free-swag-and-credits': 'DISCORD_CHANNEL_LOOT',
  '#📍-local-dk-udupi': 'DISCORD_CHANNEL_LOCAL',
  '#✈️-travel-curated': 'DISCORD_CHANNEL_TRAVEL',
  '#⏳-early-tba-radar': 'DISCORD_CHANNEL_TBA',
  '#raw-incoming-feeds': 'DISCORD_CHANNEL_RELAY',
  '#🧠-bot-training-chat': 'DISCORD_CHANNEL_TRAINING',
};

/** Resolve a text channel by env-configured ID first, then by name match across guilds. */
export async function resolveChannel(
  env: Env,
  client: any,
  bucketChannelId: string,
): Promise<any | null> {
  if (!client) return null;

  // 1. Env-ID-first for the three new buckets
  const envKey = CHANNEL_ID_ENV_KEYS[bucketChannelId];
  if (envKey) {
    const channelId = env[envKey];
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
  }

  // 2. Existing ID-based fetch (for non-bucket or pre-existing channels)
  try {
    const channel = await client.channels.fetch(bucketChannelId);
    if (channel && typeof channel.isTextBased === 'function' && channel.isTextBased() && !channel.isDMBased()) {
      return channel;
    }
  } catch {
    // fall through to name-based resolution
  }

  // 3. Exact-name fallback (preserved)
  const guilds = client.guilds?.caches?.values?.() ?? [];
  for (const guild of guilds) {
    const channels = guild.channels?.cache?.values?.() ?? [];
    const named = channels.find(
      (c: any) => typeof c.isTextBased === 'function' && c.isTextBased() && !c.isDMBased() && c.name === bucketChannelId,
    );
    if (named) {
      return named;
    }
  }
  return null;
}
