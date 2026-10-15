import type { Env } from '@zod/config';
import { createLogger } from '@zod/logger';
import type { OpportunityRow } from '@zod/db-hot/schema';
import { buildAuditCard } from './embed.js';
import { getClient } from './gateway.js';
import { recordFailure } from '@zod/db-hot/scratchpad';
import { createPbClient } from '@zod/db-hot';

export interface RouterServiceDeps {
  env: Env;
  log: ReturnType<typeof createLogger>;
}

export function startRouterService({ env, log }: RouterServiceDeps): void {
  const pbLog = log.child({ component: 'discord-router/router-service' });
  const pollIntervalMs = 60_000;

  const pollLoop = async (): Promise<void> => {
    const pb = await createPbClient(env);

    while (true) {
      try {
        const page = await pb.collection('opportunities').getList(1, 50, {
          sort: '-created',
          filter: "status = 'audited' && bucket_channel != ''",
        });

        for (const opp of page.items) {
          try {
            const opportunity = opp as unknown as OpportunityRow;
            const client = getClient();
            if (!client) {
              pbLog.warn({ id: opportunity.id }, 'discord client not ready; deferring post');
              continue;
            }
            const embed = buildAuditCard(opportunity);
            const channel = await resolveChannel(client, opportunity.bucket_channel);
            if (!channel) {
              pbLog.warn(
                { channel: opportunity.bucket_channel, id: opportunity.id },
                'channel not found; skipping post',
              );
              continue;
            }
            await channel.send({ embeds: [embed] });
            await pb.collection('opportunities').update(opportunity.id, {
              status: 'routed',
            });
            pbLog.info({ id: opportunity.id, channel: opportunity.bucket_channel }, 'audit card routed');
          } catch (err) {
            const id = (opp as { id?: string }).id ?? 'unknown';
            try {
              const { attempts, tombstoned } = await recordFailure(pb, id, String(err));
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
}

/** Resolve a text channel by ID or by name match across guilds. */
async function resolveChannel(
  client: import('discord.js').Client,
  bucketChannelId: string,
): Promise<import('discord.js').TextChannel | null> {
  try {
    const channel = await client.channels.fetch(bucketChannelId);
    if (channel && channel.isTextBased() && !channel.isDMBased()) {
      return channel as import('discord.js').TextChannel;
    }
  } catch {
    // fall through to name-based resolution
  }
  for (const guild of client.guilds.cache.values()) {
    const named = guild.channels.cache.find(
      (c) => c.isTextBased() && !c.isDMBased() && c.name === bucketChannelId,
    );
    if (named && named.isTextBased() && !named.isDMBased()) {
      return named as import('discord.js').TextChannel;
    }
  }
  return null;
}
