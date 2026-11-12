// Discord repost delivery for the announcement router.
//
// Consumes `discord_inbox` rows that triage marked `classified` and sends a
// clean embed to the mapped topic channel: original text, clickable external
// link, flyer image, and a `from <source server>` author line. No audit or
// verification label is added — this is a pure repost path.
//
// Flyers are downloaded and re-uploaded with AttachmentBuilder so the post
// does not depend on Discord's expiring signed CDN URLs. Download failures
// fall back to the original URL inside the embed and never drop the post.

import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import type { Env } from '@zod/config';
import type { DiscordInboxImage, DiscordInboxRow } from '@zod/db-hot/schema';
import { recordMachineEvent } from '@zod/db-hot/machine-events';
import { resolveChannel } from './router-service.js';

export interface RepostDeps {
  env: Env;
  log: any;
  pb: any;
  client: any;
  /** Max classified rows handled per tick. Default 10. */
  limit?: number;
}

export interface RepostResult {
  visited: number;
  posted: number;
  errors: number;
}

const MAX_TITLE_CHARS = 256;
const MAX_DESCRIPTION_CHARS = 3500;
const MAX_EMBED_DESCRIPTION = 4096;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
const REPOST_COLOR = 0x5865f2;

interface DownloadedImage {
  name: string;
  data: Buffer;
  contentType: string;
}

/** First non-empty, trimmed string from a list. */
function firstNonEmpty(values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function embedEntries(row: DiscordInboxRow): Array<Record<string, unknown>> {
  return Array.isArray(row.embed_json) ? row.embed_json : [];
}

/** Preferred clickable link: first non-Discord external URL. */
export function preferredLink(row: Pick<DiscordInboxRow, 'links'>): string {
  const links = Array.isArray(row.links) ? row.links.filter(Boolean) : [];
  const external = links.find(
    (link) => !/^https?:\/\/(?:www\.)?(?:discord\.com|discord\.gg)\//i.test(link),
  );
  return external ?? links[0] ?? '';
}

/** Plain-text fallback used before the embed is built (also useful in tests). */
export function buildRepostText(row: Pick<DiscordInboxRow, 'content' | 'links' | 'source_server'>): string {
  const content = String(row.content ?? '').trim();
  const links = Array.isArray(row.links)
    ? row.links.filter((link) => typeof link === 'string' && link.trim())
    : [];
  const attribution = `from ${String(row.source_server ?? '').trim() || 'external server'}`;
  const parts = [content, ...links, attribution].filter(Boolean);
  return parts.join('\n\n').slice(0, 1900);
}

/**
 * Build the repost embed. `imageUrl` is either `attachment://<name>` when a
 * flyer was re-uploaded or an original CDN URL when the download failed.
 */
export function buildRepostEmbed(row: DiscordInboxRow, imageUrl = ''): EmbedBuilder {
  const embeds = embedEntries(row);
  const embedTitle = firstNonEmpty(embeds.map((entry) => safeString(entry['title'])));
  const content = String(row.content ?? '').trim();
  const firstLine =
    content
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  const title = (embedTitle || firstLine || 'Announcement').slice(0, MAX_TITLE_CHARS);

  const source = String(row.source_server ?? '').trim() || 'external server';
  const link = preferredLink(row);

  // Also include every extracted link that is not already visibly present in
  // the text. Button-only and embed-url announcements otherwise lose their link.
  const missingLinks: string[] = [];
  for (const rawLink of Array.isArray(row.links) ? row.links : []) {
    if (typeof rawLink !== 'string' || !rawLink.trim()) continue;
    if (content.includes(rawLink)) continue;
    if (missingLinks.includes(rawLink)) continue;
    missingLinks.push(rawLink);
  }
  const linkBlock = missingLinks
    .slice(0, 5)
    .map((rawLink) => `🔗 ${rawLink.slice(0, 300)}`)
    .join('\n');

  // When the content's first line becomes the title, do not repeat it in the
  // description. A single long line stays in full because the title truncates.
  let body = content;
  if (!embedTitle && firstLine) {
    const splitAt = content.indexOf(firstLine) + firstLine.length;
    const remainder = content.slice(splitAt).replace(/^\s*\n+/, '').trim();
    if (remainder) body = remainder;
    else if (firstLine.length > MAX_TITLE_CHARS) body = content;
    else body = '';
  }

  let description = body.slice(0, MAX_DESCRIPTION_CHARS);
  if (linkBlock) {
    description = description ? `${description}\n\n${linkBlock}` : linkBlock;
  }
  description = description.slice(0, Math.min(MAX_EMBED_DESCRIPTION, MAX_DESCRIPTION_CHARS + 700));

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `from ${source}`.slice(0, MAX_TITLE_CHARS),
      url: row.message_url || undefined,
    })
    .setTitle(title)
    .setColor(REPOST_COLOR);

  if (link) embed.setURL(link);
  if (description) embed.setDescription(description);
  if (imageUrl) embed.setImage(imageUrl);

  return embed;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function extensionFor(image: DiscordInboxImage, contentType: string): string {
  const nameExt = /\.([a-z0-9]{2,5})$/i.exec(String(image.name ?? ''))?.[1]?.toLowerCase();
  if (nameExt && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(nameExt)) {
    return nameExt === 'jpeg' ? 'jpg' : nameExt;
  }
  const byType: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
  };
  return byType[contentType.split(';')[0]?.trim().toLowerCase() ?? ''] ?? 'png';
}

/**
 * Download one flyer with a 10s timeout and the 8 MB cap. Returns null on any
 * failure or non-image content so the caller can fall back to the URL.
 */
export async function downloadImage(
  image: DiscordInboxImage,
  index: number,
  messageId: string,
): Promise<DownloadedImage | null> {
  if (!image?.url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(image.url, { signal: controller.signal });
    if (!response.ok) return null;
    const headerType = response.headers.get('content-type') ?? '';
    const contentType = headerType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (contentType && !contentType.startsWith('image/')) return null;
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;

    const ext = extensionFor(image, contentType);
    const safeId = String(messageId).replace(/[^0-9]/g, '') || 'message';
    return {
      name: `repost-${safeId}-${index}.${ext}`,
      data: Buffer.from(buffer),
      contentType,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadImages(row: DiscordInboxRow): Promise<DownloadedImage[]> {
  const images = Array.isArray(row.images) ? row.images.slice(0, MAX_IMAGES) : [];
  const downloaded: DownloadedImage[] = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image) continue;
    const result = await downloadImage(image, index, row.message_id);
    if (result) downloaded.push(result);
  }
  return downloaded;
}

function emitRepost(
  pb: any,
  row: DiscordInboxRow,
  status: 'ok' | 'error',
  detail: string,
  extra: Record<string, unknown> = {},
): void {
  try {
    recordMachineEvent(pb, {
      trace_id: `discord:${row.message_id}`,
      agent: 'discord:repost',
      pipeline: row.pipeline || '',
      event_type: 'discord',
      tool: 'discord.repost',
      step: 'STEP_4-delivery',
      status,
      url: row.message_url ?? '',
      detail,
      meta: {
        inboxId: row.id,
        targetChannel: row.target_channel,
        sourceServer: row.source_server,
        images: Array.isArray(row.images) ? row.images.length : 0,
        ...extra,
      },
    });
  } catch {
    // Observability must never break delivery.
  }
}

/**
 * Post every classified inbox row (bounded, sequential). Rows stay
 * `classified` on failure for retry and flip to `error` after five attempts.
 */
export async function postClassifiedInbox(deps: RepostDeps): Promise<RepostResult> {
  const { env, log, pb, client } = deps;
  const limit = deps.limit ?? 10;
  const result: RepostResult = { visited: 0, posted: 0, errors: 0 };

  if (!client) {
    log.warn('discord client not ready; deferring classified reposts');
    return result;
  }

  const page = await pb.collection('discord_inbox').getList(1, limit, {
    filter: "status = 'classified' && target_channel != ''",
    sort: 'created',
  });
  const rows = (page?.items ?? []) as DiscordInboxRow[];

  for (const row of rows) {
    result.visited += 1;
    try {
      const channel = await resolveChannel(env, client, row.target_channel);
      if (!channel) {
        throw new Error(`target channel not found: ${row.target_channel}`);
      }

      const files = await loadImages(row);
      const attachments = files.map(
        (file) =>
          new AttachmentBuilder(file.data, {
            name: file.name,
            description: 'announcement flyer',
          }),
      );
      const fallbackImage = files.length
        ? `attachment://${files[0]!.name}`
        : Array.isArray(row.images) && row.images[0]?.url
          ? row.images[0].url
          : '';
      const embed = buildRepostEmbed(row, fallbackImage);

      const payload: Record<string, unknown> = {
        embeds: [embed],
        allowedMentions: { parse: [] },
      };
      if (attachments.length > 0) payload['files'] = attachments;

      const sent = await channel.send(payload);
      await pb.collection('discord_inbox').update(row.id, {
        status: 'posted',
        posted_message_id: sent?.id ?? '',
        last_error: '',
      });
      result.posted += 1;
      emitRepost(pb, row, 'ok', `reposted to ${row.target_channel}`, {
        postedMessageId: sent?.id ?? '',
        filesUploaded: attachments.length,
      });
      log.info(
        {
          inboxId: row.id,
          messageId: row.message_id,
          targetChannel: row.target_channel,
          files: attachments.length,
        },
        'reposted announcement',
      );
    } catch (err) {
      const attempts = Number(row.attempts ?? 0) + 1;
      const terminal = attempts >= MAX_ATTEMPTS;
      try {
        await pb.collection('discord_inbox').update(row.id, {
          attempts,
          status: terminal ? 'error' : 'classified',
          last_error: String(err).slice(0, 8000),
        });
      } catch (updateErr) {
        log.warn(
          { inboxId: row.id, err: String(updateErr) },
          'failed to record repost retry state',
        );
      }
      result.errors += 1;
      emitRepost(pb, row, 'error', String(err).slice(0, 500), { attempts, terminal });
      log.warn(
        { inboxId: row.id, targetChannel: row.target_channel, attempts, err: String(err) },
        'repost failed; row kept for retry',
      );
    }
  }

  return result;
}
