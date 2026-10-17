/**
 * Reminder Ticker (UI-02, D-06).
 *
 * Scans bookmarked opportunities every tick and fires 48h/24h deadline
 * reminders anchored on `deadlines.event_start` / `deadlines.apply_by`.
 * Reminders are stored in `opportunities.reminders[]` with `{ at, channel, sent }`
 * shape; the `sent` flag prevents double-firing (Pitfall 6).
 *
 * Registered as a gateway job (reminder-tick, every 15m + 5m jitter) through
 * the single scheduler registry — no setInterval scatter.
 */

import type { Env } from '@zod/config';
import { createLogger, type Logger } from '@zod/logger';
import { createPbClient } from '@zod/db-hot';
import { getClient } from './gateway.js';
import { resolveChannel } from './router-service.js';

export interface ReminderTickResult {
  scanned: number;
  fired: number;
  skipped: number;
  errors: number;
}

export interface ReminderDeps {
  env: Env;
  log: ReturnType<typeof createLogger>;
  /** Injected PocketBase client (tests inject a mock). */
  pb?: any;
  /** Injected discord.js Client (tests inject a mock). */
  client?: any;
}

const NOW_ISO = () => new Date().toISOString();

/** Human-readable reminder text. */
function formatReminder(reminder: any, deadlines: any): string {
  const anchor = deadlines?.event_start ?? deadlines?.apply_by;
  const anchorLabel = deadlines?.event_start ? 'Event starts' : 'Apply by';
  const anchorDate = anchor ? new Date(anchor).toISOString().slice(0, 10) : 'unknown date';
  const hoursAgo = deadlines?.event_start ? 48 : 24;
  return `${anchorLabel} in ${hoursAgo}h (${anchorDate})`;
}

/** Create a reminder ticker with injected dependencies (testable). */
export function createReminderTick(deps: ReminderDeps): (logPrefix?: string) => Promise<ReminderTickResult> {
  const { env, log, pb: pbDeps, client: clientDeps } = deps;
  const pbLog = log.child({ component: 'discord-router/reminder' });

  let pbPromise: Promise<any> | null = null;
  const getPb = async () => {
    if (!pbPromise) {
      pbPromise = pbDeps ?? createPbClient(env);
    }
    return pbPromise;
  };

  async function tick(logPrefix?: string): Promise<ReminderTickResult> {
    const result: ReminderTickResult = { scanned: 0, fired: 0, skipped: 0, errors: 0 };
    const now = NOW_ISO();
    const prefix = logPrefix ? `[${logPrefix}] ` : '';

    try {
      const client = clientDeps ?? getClient();
      if (!client) {
        pbLog.warn('discord client not ready; deferring reminder tick');
        return result;
      }

      // Scan bookmarked opportunities where reminders exist and not all sent
      const pb = await getPb();
      const page = await pb.collection('opportunities').getList(1, 50, {
        filter: `bookmark = true`,
        sort: 'updated',
      });

      const items = page.items ?? [];
      result.scanned = items.length;

      for (const opp of items) {
        try {
          const reminders = opp.reminders ?? [];
          const due = reminders.filter((r: any) => !r.sent && r.at <= now);

          if (due.length === 0) {
            result.skipped++;
            continue;
          }

          for (const reminder of due) {
            try {
              // Resolve channel via resolveChannel (env-ID-first, then name fallback)
              const channel = await resolveChannel(env, client, reminder.channel);
              if (!channel) {
                pbLog.warn({ channel: reminder.channel, oppId: opp.id }, 'reminder channel not found; skipping');
                result.skipped++;
                continue;
              }

              // Send the reminder message
              await channel.send({
                content: `⏰ Reminder: **${opp.title}** — ${formatReminder(reminder, opp.deadlines)}`,
              });

              // Mark this reminder as sent immediately (Pitfall 6: prevent double-firing)
              const updatedReminders = reminders.map((r: any) =>
                r.at === reminder.at ? { ...r, sent: true } : r,
              );
              await pb.collection('opportunities').update(opp.id, {
                reminders: updatedReminders,
              });

              result.fired++;
              pbLog.info({ oppId: opp.id, reminderAt: reminder.at }, 'reminder fired and marked sent');
            } catch (err) {
              // Per-reminder error isolation — never abort the batch
              pbLog.warn({ err: String(err), oppId: opp.id, reminderAt: reminder.at }, 'reminder fire failed');
              result.errors++;
            }
          }
        } catch (err) {
          // Per-opportunity error isolation — never abort the batch
          pbLog.warn({ err: String(err), oppId: (opp as any).id }, 'opportunity reminder scan failed');
          result.errors++;
        }
      }

      pbLog.info({ ...result, prefix }, 'reminder tick done');
    } catch (err) {
      pbLog.warn({ err: String(err) }, 'reminder tick iteration threw');
      result.errors++;
    }

    return result;
  }

  return tick;
}

/** Export the default reminderTick for entrypoint/scheduler use. */
export async function reminderTick(opts: { env: Env; log: Logger; pb?: any; client?: any }): Promise<void> {
  const tick = createReminderTick(opts);
  await tick('reminder-tick');
}
