/**
 * Taste Rule Ingestion Service (MEM-04, D-11).
 *
 * Three ingestion paths for creating taste rules from operator feedback in
 * #🧠-bot-training-chat:
 *   1. Reaction-based: 👍/👎 on an audit card → BOOST/BLOCK rule
 *   2. Keyword command: `!rule <kind> <text>` in #🧠-bot-training-chat
 *   3. DM to bot: operator DMs the bot a rule command
 *
 * All three create/update taste_rules rows in PocketBase with a `source`
 * field for observability, and post a confirmation reply in the originating
 * channel (never a DM — per Pitfall 9).
 *
 * Registered at gateway boot alongside startBookmarkHandler. All dependencies
 * (env, log, pb, client) are injectable for testing.
 */

import type { Env } from '@zod/config';
import { TasteRule } from '@zod/db-hot/schema';
import { createLogger, type Logger } from '@zod/logger';
import { createPbClient } from '@zod/db-hot';
import { getClient } from './gateway.js';

export interface TasteIngestionHandler {
  stop(): void;
}

export interface TasteIngestionDeps {
  env: Env;
  log: ReturnType<typeof createLogger>;
  /** Injected PocketBase client (tests inject a mock). */
  pb?: any;
  /** Injected discord.js Client (tests inject a mock). */
  client?: any;
}

/**
 * Parse a rule command string into { kind, rule, weight }.
 *
 * Supported formats:
 *   !rule BLOCK <text>
 *   !rule BOOST <text>
 *   !rule WEIGHT <value> <text>
 *   !rule CUSTOM <text>
 */
export function parseRuleCommand(
  content: string,
): { kind: string; rule: string; weight?: number } {
  const trimmed = content.trim();
  const afterPrefix = trimmed.replace(/^!rule\s*/i, '');
  const tokens = afterPrefix.split(/\s+/);
  const kind = tokens[0]?.toUpperCase() ?? 'CUSTOM';

  let weight: number | undefined;
  let ruleTokens: string[];

  if (
    kind === 'WEIGHT' &&
    tokens[1] &&
    /^-?\d+(\.\d+)?$/.test(tokens[1])
  ) {
    weight = Number(tokens[1]);
    ruleTokens = tokens.slice(2);
  } else {
    ruleTokens = tokens.slice(1);
  }

  return { kind, rule: ruleTokens.join(' '), weight };
}

/** Extract rule context (title + optional URL) from an audit card message embed. */
function extractRuleContext(message: any): string {
  const embed = message?.embeds?.[0];
  const title = embed?.title ?? message?.content ?? '';
  let url = '';
  if (embed?.url) {
    url = embed.url;
  } else {
    // Look for markdown link in embed fields (Links field: [Official](url))
    for (const field of embed?.fields ?? []) {
      const match = String(field.value ?? '').match(/\((https?:\/\/[^)]+)\)/);
      if (match) {
        url = match[1];
        break;
      }
    }
  }
  return title ? `${title}${url ? ` — ${url}` : ''}` : 'audit card';
}

/** Create a taste ingestion handler with injected dependencies (testable). */
export function createTasteIngestionHandler(deps: TasteIngestionDeps): TasteIngestionHandler {
  const { env, log, pb: pbDeps, client: clientDeps } = deps;
  const pbLog = log.child({ component: 'discord-router/taste-ingest' });

  let pbPromise: Promise<any> | null = null;
  const getPb = async () => {
    if (!pbPromise) {
      pbPromise = pbDeps ?? createPbClient(env);
    }
    return pbPromise;
  };

  const client = clientDeps ?? getClient();
  if (!client) {
    pbLog.warn('discord client not ready; taste ingestion handler not started');
    return { stop: () => undefined };
  }

  // ---------------------------------------------------------------------------
  // Path 1: Reaction-based (👍/👎 on audit card)
  // ---------------------------------------------------------------------------
  client.on('messageReactionAdd', async (reaction: any, user: any) => {
    try {
      // T-6-10: only non-bot users create taste rules
      if (user.bot) return;

      // Handle partial messages (reaction on uncached message)
      if (reaction.message?.partial) {
        try {
          await reaction.message.fetch();
        } catch {
          return;
        }
      }

      const emojiName = reaction.emoji?.name;
      if (emojiName !== '👍' && emojiName !== '👎') return;

      const kind = emojiName === '👍' ? 'BOOST' : 'BLOCK';
      const context = extractRuleContext(reaction.message);
      const rule = kind === 'BOOST' ? `Prefer: ${context}` : `Reject: ${context}`;

      // Zod validation at the taste rule boundary
      const tasteRule = TasteRule.parse({
        kind,
        rule,
        weight: 1.0,
        source: 'reaction',
      });

      const pb = await getPb();
      await pb.collection('taste_rules').create({
        kind: tasteRule.kind,
        rule: tasteRule.rule,
        weight: tasteRule.weight,
        source: tasteRule.source,
      });

      // Confirmation reply in the originating channel (not a DM)
      await reaction.message.reply(
        `✅ Taste rule created: ${kind} — ${rule}`,
      );
    } catch (err) {
      pbLog.warn({ err: String(err) }, 'taste ingestion reaction handler error');
    }
  });

  // ---------------------------------------------------------------------------
  // Path 2 & 3: messageCreate (keyword command in training channel, or DM)
  // ---------------------------------------------------------------------------
  client.on('messageCreate', async (msg: any) => {
    try {
      if (msg.author.bot) return;

      // Path 2: Keyword command in #🧠-bot-training-chat
      if (
        env.DISCORD_CHANNEL_TRAINING &&
        msg.channelId === env.DISCORD_CHANNEL_TRAINING &&
        msg.content.startsWith('!rule')
      ) {
        const parsed = parseRuleCommand(msg.content);
        const tasteRule = TasteRule.parse({
          kind: parsed.kind,
          rule: parsed.rule,
          weight: parsed.weight ?? 1.0,
          source: 'keyword',
        });

        const pb = await getPb();
        await pb.collection('taste_rules').create({
          kind: tasteRule.kind,
          rule: tasteRule.rule,
          weight: tasteRule.weight,
          source: tasteRule.source,
        });

        // Confirmation reply in the originating channel (Pitfall 9)
        await msg.reply(`✅ Taste rule created: ${parsed.kind} — ${parsed.rule}`);
        return;
      }

      // Path 3: DM to bot
      const isDM = msg.channel?.type === 'DM' || msg.guild === null;
      if (isDM && msg.content.startsWith('!rule')) {
        const parsed = parseRuleCommand(msg.content);
        const tasteRule = TasteRule.parse({
          kind: parsed.kind,
          rule: parsed.rule,
          weight: parsed.weight ?? 1.0,
          source: 'dm',
        });

        const pb = await getPb();
        await pb.collection('taste_rules').create({
          kind: tasteRule.kind,
          rule: tasteRule.rule,
          weight: tasteRule.weight,
          source: tasteRule.source,
        });

        // Confirmation reply in the DM (originating channel)
        await msg.reply(`✅ Taste rule created: ${parsed.kind} — ${parsed.rule}`);
      }
    } catch (err) {
      pbLog.warn({ err: String(err) }, 'taste ingestion message handler error');
    }
  });

  return {
    stop: () => {
      // no-op: listeners run until process exit
    },
  };
}

/** Start taste ingestion (entrypoint usage: creates deps from env + log). */
export function startTasteIngestion({
  env,
  log,
}: {
  env: Env;
  log: Logger;
}): void {
  void createTasteIngestionHandler({ env, log });
}
