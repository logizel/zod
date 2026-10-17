/**
 * Bookmark Reaction Handler (UI-02, D-05, D-06).
 *
 * Listens for discord.js `messageReactionAdd` events with the custom server
 * bookmark emoji (BOOKMARK_EMOJI_ID). On match, sets `bookmark=true` on the
 * opportunity row (found by discord_message_id) and arms 48h/24h deadline
 * reminders anchored on `deadlines.event_start` / `deadlines.apply_by`.
 *
 * Registered at gateway boot alongside the router service. All dependencies
 * (env, log, pb, client) are injectable for testing.
 */

import type { Env } from '@zod/config';
import type { OpportunityReminder } from '@zod/db-hot/schema';
import { createLogger, type Logger } from '@zod/logger';
import { createPbClient } from '@zod/db-hot';
import { getClient } from './gateway.js';

export interface BookmarkHandler {
  stop(): void;
}

export interface BookmarkDeps {
  env: Env;
  log: ReturnType<typeof createLogger>;
  /** Injected PocketBase client (tests inject a mock). */
  pb?: any;
  /** Injected discord.js Client (tests inject a mock). */
  client?: any;
}

const HOUR_MS = 60 * 60 * 1000;

/** Compute 48h/24h reminders anchored on the event date (D-06). */
function computeReminders(deadlines: any, channel: string): OpportunityReminder[] {
  const reminders: OpportunityReminder[] = [];
  const anchor = deadlines?.event_start ?? deadlines?.apply_by;
  if (!anchor) return reminders;

  const anchorDate = new Date(anchor);
  const now = new Date();

  // 48h reminder
  const r48 = new Date(anchorDate.getTime() - 48 * HOUR_MS);
  if (r48 > now) {
    reminders.push({ at: r48.toISOString(), channel, sent: false });
  }

  // 24h reminder
  const r24 = new Date(anchorDate.getTime() - 24 * HOUR_MS);
  if (r24 > now) {
    reminders.push({ at: r24.toISOString(), channel, sent: false });
  }

  return reminders;
}

/** Create a bookmark handler with injected dependencies (testable). */
export function createBookmarkHandler(deps: BookmarkDeps): BookmarkHandler {
  const { env, log, pb: pbDeps, client: clientDeps } = deps;
  const pbLog = log.child({ component: 'discord-router/bookmark' });

  let pbPromise: Promise<any> | null = null;
  const getPb = async () => {
    if (!pbPromise) {
      pbPromise = pbDeps ?? createPbClient(env);
    }
    return pbPromise;
  };

  const client = clientDeps ?? getClient();
  if (!client) {
    pbLog.warn('discord client not ready; bookmark handler not started');
    return { stop: () => undefined };
  }

  client.on('messageReactionAdd', async (reaction: any, user: any) => {
    try {
      // T-6-08: only non-bot users trigger bookmarks
      if (user.bot) return;

      // D-05: only the custom bookmark emoji triggers
      if (!env.BOOKMARK_EMOJI_ID || reaction.emoji?.id !== env.BOOKMARK_EMOJI_ID) return;

      // Pitfall 2: handle partial messages (reaction on uncached message)
      if (reaction.message?.partial) {
        try {
          await reaction.message.fetch();
        } catch {
          return;
        }
      }

      const messageId = reaction.message?.id;
      if (!messageId) return;

      // Find the opportunity by discord_message_id
      const pb = await getPb();
      const page = await pb.collection('opportunities').getList(1, 1, {
        filter: `discord_message_id = '${messageId}'`,
      });

      const opp = page.items?.[0];
      if (!opp) return;

      // Set bookmark=true and arm reminders (D-06: anchor on event date)
      const reminders = computeReminders(opp.deadlines, opp.bucket_channel);
      await pb.collection('opportunities').update(opp.id, {
        bookmark: true,
        reminders,
      });

      // Confirmation reply
      await reaction.message.reply(
        '🔖 Bookmarked — you will get 48h and 24h reminders before the deadline.',
      );
    } catch (err) {
      pbLog.warn({ err: String(err) }, 'bookmark reaction handler error');
    }
  });

  return {
    stop: () => {
      // no-op: listener runs until process exit; client.removeAllListeners could be added if needed
    },
  };
}

/** Start the bookmark handler (entrypoint usage: creates deps from env + log). */
export function startBookmarkHandler({ env, log }: { env: Env; log: Logger }): void {
  void createBookmarkHandler({ env, log });
}
