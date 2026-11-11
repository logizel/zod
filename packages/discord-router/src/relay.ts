/**
 * Announcements Relay Service (ING-04, D-04).
 *
 * Polls an external Discord #announcements channel on a cron timer and
 * relays new posts into the private #raw-incoming-feeds channel. Uses
 * discord.js v14's channel.messages.fetch({ after }) for cursor-based
 * polling — no gateway listener, no cross-guild bot membership needed.
 *
 * The last relayed message ID is persisted in PocketBase agent_telemetry
 * (slot: 'relay-cursor') for crash recovery — survives bot restarts.
 *
 * Registered as a gateway job (gateway-relay-poll) via registerGatewayJobs with a
 * tickHandler — no setInterval scatter.
 */

import type { Env } from '@zod/config';
import { createLogger, type Logger } from '@zod/logger';
import { getClient } from './gateway.js';
import { resolveChannel } from './router-service.js';
import { createPbClient } from '@zod/db-hot';
import { recordMachineEvent } from '@zod/db-hot/machine-events';

const RELAY_CURSOR_SLOT_PREFIX = 'relay-cursor:';

export { RELAY_CURSOR_SLOT_PREFIX, cursorSlotFor };

/** Build the agent_telemetry slot used to persist a source channel's cursor. */
function cursorSlotFor(sourceChannelId: string): string {
  return `${RELAY_CURSOR_SLOT_PREFIX}${sourceChannelId}`;
}

export interface RelayService {
  tick(): Promise<void>;
  stop(): void;
}

export interface RelayDeps {
  env: Env;
  log: ReturnType<typeof createLogger>;
  /** Injected PocketBase client (tests inject a mock). */
  pb?: any;
  /** Injected discord.js Client (tests inject a mock). */
  client?: any;
}

/** Create a relay service with injected dependencies (testable). */
export function createRelayService(deps: RelayDeps): RelayService {
  const { env, log, pb: pbDeps, client: clientDeps } = deps;
  const pbLog = log.child({ component: 'discord-router/relay' });

  let pbPromise: Promise<any> | null = null;
  const getPb = async () => {
    if (!pbPromise) {
      pbPromise = pbDeps ?? createPbClient(env);
    }
    return pbPromise;
  };

  /** Read the last relayed message ID for a source channel (crash recovery). */
  async function getLastRelayedId(slot: string): Promise<string | null> {
    try {
      const pb = await getPb();
      const row = await pb.collection('agent_telemetry').getFirstListItem(
        `slot = '${slot}'`,
      );
      return row?.detail ?? null;
    } catch {
      return null;
    }
  }

  /** Persist the last relayed message ID for a source channel. */
  async function setLastRelayedId(messageId: string, slot: string): Promise<void> {
    try {
      const pb = await getPb();
      const existing = await pb.collection('agent_telemetry').getFirstListItem(
        `slot = '${slot}'`,
      );
      if (existing) {
        await pb.collection('agent_telemetry').update(existing.id, {
          detail: messageId,
          updated: new Date().toISOString(),
        });
      } else {
        await pb.collection('agent_telemetry').create({
          slot,
          detail: messageId,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        });
      }
    } catch (err) {
      pbLog.warn({ err: String(err), slot }, 'failed to persist relay cursor');
    }
  }

  /** One poll tick: fetch new messages after the cursor, relay each to target. */
  async function tick(): Promise<void> {
    const client = clientDeps ?? getClient();
    if (!client) {
      pbLog.warn('discord client not ready; deferring relay tick');
      return;
    }

    const sourceChannelIds = [
      env.DISCORD_RELAY_SOURCE_CHANNEL_ID,
      env.DISCORD_RELAY_SOURCE_CHANNEL_ID_1,
      env.DISCORD_RELAY_SOURCE_CHANNEL_ID_2,
      env.DISCORD_RELAY_SOURCE_CHANNEL_ID_3,
    ];
    const uniqueSourceChannelIds = [...new Set(sourceChannelIds.filter(Boolean))];

    if (uniqueSourceChannelIds.length === 0) {
      pbLog.warn(
        'No DISCORD_RELAY_SOURCE_CHANNEL_ID_* set; skipping relay tick',
      );
      return;
    }

    const targetChannelId = env.DISCORD_CHANNEL_RELAY;
    if (!targetChannelId) {
      pbLog.warn('DISCORD_CHANNEL_RELAY not set; skipping relay tick');
      return;
    }

    // Resolve target channel via resolveChannel (env-ID-first, then name fallback)
    let targetChannel: any;
    try {
      targetChannel = await resolveChannel(env, client, targetChannelId);
    } catch (err) {
      pbLog.warn({ err: String(err) }, 'failed to resolve target channel');
      return;
    }
    if (!targetChannel) {
      pbLog.warn({ channel: targetChannelId }, 'target channel not found');
      return;
    }

    // Best-effort machine log for each relayed message.
    const pb = await getPb().catch(() => null);
    const emitRelay = (
      messageId: string,
      status: 'ok' | 'error',
      detail: string,
      extra: Record<string, unknown> = {},
    ): void => {
      if (!pb) return;
      try {
        recordMachineEvent(pb, {
          trace_id: `relay:${messageId}`,
          agent: 'discord:relay',
          pipeline: '',
          event_type: 'discord',
          tool: 'discord.relay',
          step: 'STEP_4-delivery',
          status,
          detail,
          meta: { targetChannel: targetChannelId, ...extra },
        });
      } catch {
        // Observability must never break the relay.
      }
    };

    // Poll every configured source announcement channel independently, each
    // with its own message cursor so no source's updates are skipped.
    for (const sourceChannelId of uniqueSourceChannelIds) {
      let sourceChannel: any;
      try {
        sourceChannel = await client.channels.fetch(sourceChannelId);
        if (
          !sourceChannel ||
          typeof sourceChannel.isTextBased !== 'function' ||
          !sourceChannel.isTextBased()
        ) {
          pbLog.warn({ channel: sourceChannelId }, 'source channel is not text-based');
          continue;
        }
      } catch (err) {
        pbLog.warn({ err: String(err), channel: sourceChannelId }, 'failed to fetch source channel');
        continue;
      }

      const slot = cursorSlotFor(sourceChannelId);
      const lastId = await getLastRelayedId(slot);

      let messages: any;
      try {
        messages = await sourceChannel.messages.fetch({
          limit: 20,
          after: lastId ?? undefined,
        });
      } catch (err) {
        pbLog.warn({ err: String(err), channel: sourceChannelId }, 'failed to fetch messages from source channel');
        continue;
      }

      const msgArray = Array.from(messages.values()) as Array<{
        id: string;
        content: string;
      }>; // oldest first as returned by discord.js
      let newLastId = lastId;

      for (const msg of msgArray) {
        try {
          await targetChannel.send({ content: msg.content });
          // Track the highest message ID seen (snowflake IDs are time-ordered)
          if (!newLastId || msg.id > newLastId) {
            newLastId = msg.id;
          }
          emitRelay(msg.id, 'ok', 'relayed message to #raw-incoming-feeds', {
            sourceChannel: sourceChannelId,
            targetChannel: targetChannelId,
            chars: msg.content.length,
          });
        } catch (err) {
          // Per-message error isolation — never abort the batch on one failure
          pbLog.warn({ err: String(err), messageId: msg.id }, 'failed to relay message');
          emitRelay(msg.id, 'error', `relay failed: ${String(err)}`);
        }
      }

      if (newLastId && newLastId !== lastId) {
        await setLastRelayedId(newLastId, slot);
        pbLog.info({
          lastId: newLastId,
          count: msgArray.length,
          channel: sourceChannelId,
        }, 'relay tick done');
      }
    }
  }

  return {
    tick,
    stop: () => {
      // no-op: tick is invoked by the scheduler registry
    },
  };
}

/** Start the relay service (entrypoint usage). */
export function startRelayService(deps: RelayDeps): RelayService {
  return createRelayService(deps);
}
