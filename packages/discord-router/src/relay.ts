// Announcements capture + repost orchestration (ING-04, D-04).
//
// Polls every configured source announcement channel on the bot's cron tick:
//   source channel -> extract text/embeds/links/flyers -> discord_inbox (pending)
// then posts classified rows to their triage-mapped topic channel.
//
// Capture and posting live in the bot because it owns the Discord gateway.
// Triage lives in the scheduler (single LlmRouter) and only flips inbox rows
// to `classified`, so this module never needs an LLM client.
//
// The per-source message cursor persists in agent_telemetry
// (`relay-cursor:<sourceId>`). A 404 on first read means "no cursor yet" and
// the write path creates the row with all required telemetry fields; any other
// PB failure skips that source for the tick instead of replaying history.

import type { Env } from '@zod/config';
import { createLogger } from '@zod/logger';
import { getClient } from './gateway.js';
import { resolveChannel } from './router-service.js';
import { createPbClient } from '@zod/db-hot';
import { recordMachineEvent } from '@zod/db-hot/machine-events';
import {
  extractMessage,
  hasPayload,
  type ExtractedMessage,
} from './relay-extract.js';
import { postClassifiedInbox } from './relay-post.js';

const RELAY_CURSOR_SLOT_PREFIX = 'relay-cursor:';
const MAX_MESSAGES_PER_SOURCE = 20;

export { RELAY_CURSOR_SLOT_PREFIX, cursorSlotFor, isNotFoundError };

/** Build the agent_telemetry slot used to persist a source channel's cursor. */
function cursorSlotFor(sourceChannelId: string): string {
  return `${RELAY_CURSOR_SLOT_PREFIX}${sourceChannelId}`;
}

/** PocketBase ClientResponseError keeps the HTTP status on `status`. */
function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown };
  return (
    err.status === 404 ||
    err.statusCode === 404 ||
    err.code === 404 ||
    (typeof err.message === 'string' && /\b404\b/.test(err.message))
  );
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

interface SourceMeta {
  sourceServer: string;
  sourceChannelName: string;
}

function escapeFilter(value: string): string {
  return value.replace(/'/g, "''");
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Discord snowflakes are time-ordered; sort ascending regardless of API order. */
function compareSnowflakes(a: { id?: unknown }, b: { id?: unknown }): number {
  const left = safeString(a?.id);
  const right = safeString(b?.id);
  try {
    const leftBig = BigInt(left);
    const rightBig = BigInt(right);
    return leftBig < rightBig ? -1 : leftBig > rightBig ? 1 : 0;
  } catch {
    return left.localeCompare(right);
  }
}

function collectionValues(value: unknown): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof (value as { values?: unknown }).values === 'function') {
    return Array.from((value as { values(): Iterable<any> }).values());
  }
  return Object.values(value as Record<string, any>);
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

  /** Read the last captured message ID for a source channel (crash recovery). */
  async function getLastRelayedId(slot: string): Promise<string | null> {
    try {
      const pb = await getPb();
      const row = await pb
        .collection('agent_telemetry')
        .getFirstListItem(`slot = '${escapeFilter(slot)}'`);
      return row?.detail ? String(row.detail) : null;
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  /**
   * Persist the cursor once per source per tick. `getFirstListItem` rejects
   * with 404 when the row does not exist yet; only that case creates a row.
   */
  async function setLastRelayedId(slot: string, messageId: string): Promise<void> {
    const pb = await getPb();
    const collection = pb.collection('agent_telemetry');
    let existing: any = null;
    try {
      existing = await collection.getFirstListItem(`slot = '${escapeFilter(slot)}'`);
    } catch (err) {
      if (!isNotFoundError(err)) {
        pbLog.warn({ err: String(err), slot }, 'failed to read relay cursor for update');
        return;
      }
    }

    if (existing) {
      await collection.update(existing.id, { detail: messageId });
      return;
    }

    await collection.create({
      slot,
      provider: 'discord',
      model: 'gateway',
      step: 'relay',
      status: 'done',
      detail: messageId,
      duration_ms: 0,
    });
  }

  /** Resolve the original server/channel via the follower webhook. */
  async function resolveSourceMeta(
    client: any,
    message: any,
    cache: Map<string, SourceMeta>,
  ): Promise<SourceMeta> {
    const webhookId = safeString(message?.webhookId);
    if (webhookId) {
      const cached = cache.get(webhookId);
      if (cached) return cached;

      let meta: SourceMeta = {
        sourceServer: '',
        sourceChannelName: safeString(message?.author?.username),
      };
      try {
        const webhook = await client.fetchWebhook(webhookId);
        meta = {
          sourceServer: safeString(webhook?.sourceGuild?.name),
          sourceChannelName:
            safeString(webhook?.sourceChannel?.name) || safeString(message?.author?.username),
        };
      } catch (err) {
        pbLog.debug?.(
          { err: String(err), webhookId },
          'webhook attribution unavailable; using external server fallback',
        );
      }
      cache.set(webhookId, meta);
      return meta;
    }

    return {
      sourceServer: safeString(message?.guild?.name),
      sourceChannelName:
        safeString(message?.channel?.name) || safeString(message?.author?.username),
    };
  }

  function emitCapture(
    pb: any,
    extracted: ExtractedMessage,
    status: 'ok' | 'skip' | 'error',
    detail: string,
    extra: Record<string, unknown> = {},
  ): void {
    try {
      recordMachineEvent(pb, {
        trace_id: `discord:${extracted.messageId || extra['messageId'] || ''}`,
        agent: 'discord:relay',
        pipeline: '',
        event_type: 'discord',
        tool: 'discord.capture',
        step: 'STEP_1-capture',
        status,
        url: extracted.messageUrl,
        detail,
        meta: {
          sourceChannel: extracted.sourceChannelId,
          sourceServer: extracted.sourceServer,
          links: extracted.links.length,
          images: extracted.images.length,
          ...extra,
        },
      });
    } catch {
      // Observability must never break capture.
    }
  }

  async function findInbox(pb: any, field: string, value: string): Promise<any | null> {
    try {
      return await pb
        .collection('discord_inbox')
        .getFirstListItem(`${field} = '${escapeFilter(value)}'`);
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  /**
   * Insert a captured message once. Message IDs are globally unique; the
   * dedup key catches the same announcement followed into two source channels.
   */
  async function captureMessage(
    pb: any,
    extracted: ExtractedMessage,
  ): Promise<'captured' | 'duplicate-message' | 'duplicate-content'> {
    if (await findInbox(pb, 'message_id', extracted.messageId)) {
      return 'duplicate-message';
    }
    if (extracted.dedupKey && (await findInbox(pb, 'dedup_key', extracted.dedupKey))) {
      return 'duplicate-content';
    }

    await pb.collection('discord_inbox').create({
      message_id: extracted.messageId,
      source_channel_id: extracted.sourceChannelId,
      source_server: extracted.sourceServer,
      source_channel_name: extracted.sourceChannelName,
      guild_id: extracted.guildId,
      message_url: extracted.messageUrl,
      content: extracted.content,
      embed_json: extracted.embeds,
      links: extracted.links,
      images: extracted.images,
      dedup_key: extracted.dedupKey,
      status: 'pending',
      classification: {},
      posted_message_id: '',
      attempts: 0,
      last_error: '',
    });
    return 'captured';
  }

  async function mirrorRaw(
    client: any,
    extracted: ExtractedMessage,
    mirrorChannel: any,
  ): Promise<void> {
    if (!mirrorChannel) return;
    const lines = [extracted.content];
    if (extracted.links[0]) lines.push(extracted.links[0]);
    const text = lines.filter(Boolean).join('\n\n').slice(0, 1900);
    if (!text) return;
    await mirrorChannel.send({
      content: text,
      allowedMentions: { parse: [] },
    });
  }

  /** One poll tick: capture every source, then post classified rows. */
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
      pbLog.warn('No DISCORD_RELAY_SOURCE_CHANNEL_ID_* set; skipping capture stage');
    }

    const pb = await getPb().catch((err) => {
      pbLog.warn({ err: String(err) }, 'failed to construct PB client; relay tick skipped');
      return null;
    });
    if (!pb) return;

    const mirrorEnabled = String(env.DISCORD_RELAY_MIRROR_RAW).toLowerCase() === 'true';
    let mirrorChannel: any = null;
    if (mirrorEnabled && env.DISCORD_CHANNEL_RELAY) {
      try {
        mirrorChannel = await resolveChannel(env, client, env.DISCORD_CHANNEL_RELAY);
      } catch (err) {
        pbLog.warn({ err: String(err) }, 'failed to resolve raw mirror channel');
      }
    }

    const webhookCache = new Map<string, SourceMeta>();

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
        pbLog.warn(
          { err: String(err), channel: sourceChannelId },
          'failed to fetch source channel',
        );
        continue;
      }

      const slot = cursorSlotFor(sourceChannelId);
      let lastId: string | null;
      try {
        lastId = await getLastRelayedId(slot);
      } catch (err) {
        pbLog.warn(
          { err: String(err), channel: sourceChannelId },
          'cursor read failed; skipping source this tick',
        );
        continue;
      }

      let messages: any;
      try {
        if (!lastId) {
          // Cold start: never replay channel history into the topic channels.
          // Initialize the cursor at the newest existing message and start
          // capturing from the next new announcement onward.
          const latest = await sourceChannel.messages.fetch({ limit: 1 });
          const newest = collectionValues(latest).sort(compareSnowflakes).at(-1) ?? null;
          const newestId = safeString(newest?.id);
          if (newestId) {
            try {
              await setLastRelayedId(slot, newestId);
              pbLog.info(
                { channel: sourceChannelId, lastId: newestId },
                'initialized relay cursor; skipping historical messages',
              );
            } catch (err) {
              pbLog.warn(
                { err: String(err), slot },
                'failed to initialize relay cursor; retrying next tick',
              );
            }
          }
          continue;
        }
        messages = await sourceChannel.messages.fetch({
          limit: MAX_MESSAGES_PER_SOURCE,
          after: lastId,
        });
      } catch (err) {
        pbLog.warn(
          { err: String(err), channel: sourceChannelId },
          'failed to fetch messages from source channel',
        );
        continue;
      }

      const msgArray = collectionValues(messages).sort(compareSnowflakes);
      let newLastId = lastId;

      for (const msg of msgArray) {
        const messageId = safeString(msg?.id);
        if (!messageId) continue;
        let extracted: ExtractedMessage | null = null;
        try {
          const meta = await resolveSourceMeta(client, msg, webhookCache);
          extracted = extractMessage(msg, {
            sourceChannelId,
            sourceServer: meta.sourceServer,
            sourceChannelName: meta.sourceChannelName,
          });

          if (!hasPayload(extracted)) {
            emitCapture(pb, extracted, 'skip', 'empty message (no text, link, or image)');
            newLastId = messageId;
            continue;
          }

          const outcome = await captureMessage(pb, extracted);
          if (outcome === 'captured') {
            emitCapture(pb, extracted, 'ok', 'captured into discord_inbox');
            await mirrorRaw(client, extracted, mirrorChannel).catch((err: unknown) => {
              pbLog.warn(
                { err: String(err), messageId },
                'raw mirror failed; capture already persisted',
              );
            });
          } else {
            emitCapture(pb, extracted, 'skip', outcome, { messageId });
          }
          newLastId = messageId;
        } catch (err) {
          const fallback = extracted ?? {
            messageId,
            sourceChannelId,
            sourceServer: '',
            sourceChannelName: '',
            guildId: '',
            messageUrl: '',
            content: '',
            embeds: [],
            links: [],
            images: [],
            dedupKey: '',
          };
          emitCapture(pb, fallback as ExtractedMessage, 'error', String(err), { messageId });
          pbLog.warn({ err: String(err), messageId }, 'capture failed; stopping source batch');
          break;
        }
      }

      if (newLastId && newLastId !== lastId) {
        try {
          await setLastRelayedId(slot, newLastId);
          pbLog.info(
            { lastId: newLastId, count: msgArray.length, channel: sourceChannelId },
            'capture tick done',
          );
        } catch (err) {
          pbLog.warn(
            { err: String(err), slot },
            'failed to persist relay cursor; next tick will re-read overlapping messages',
          );
        }
      }
    }

    // Posting runs in the same gateway-owned tick so a classified row becomes a
    // Discord message within one cadence even when capture had nothing new.
    try {
      const postResult = await postClassifiedInbox({ env, log: pbLog, pb, client });
      if (postResult.visited > 0) {
        pbLog.info(postResult, 'repost tick done');
      }
    } catch (err) {
      pbLog.warn({ err: String(err) }, 'repost stage failed; classified rows stay queued');
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
