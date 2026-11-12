// Discord announcement extraction for the repost router.
//
// Followed announcement channels arrive as webhook messages. The useful
// payload is spread across `content`, embeds, link buttons, and attachments;
// copying only `content` loses most flyers and apply links. This module is
// pure so the capture path stays easy to test.

import { hashText, hashUrl, normalizeUrl } from '@zod/dedup';

export interface ExtractedEmbedField {
  name: string;
  value: string;
}

export interface ExtractedEmbed {
  title: string;
  description: string;
  url: string;
  fields: ExtractedEmbedField[];
  imageUrl: string;
  thumbnailUrl: string;
}

export interface ExtractedImage {
  url: string;
  name: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
}

export interface ExtractedMessage {
  messageId: string;
  sourceChannelId: string;
  sourceServer: string;
  sourceChannelName: string;
  guildId: string;
  messageUrl: string;
  content: string;
  embeds: ExtractedEmbed[];
  links: string[];
  images: ExtractedImage[];
  dedupKey: string;
}

export interface ExtractMessageOptions {
  sourceChannelId: string;
  /** Resolved from the follower webhook by the caller. */
  sourceServer?: string;
  sourceChannelName?: string;
}

const MAX_CONTENT_CHARS = 8000;
const MAX_IMAGES = 4;
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const DISCORD_LINK = /^https?:\/\/(?:www\.)?(?:discord\.com|discord\.gg)\//i;

/** Convert discord.js Collections and plain arrays into an array. */
function toArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof (value as { values?: unknown }).values === 'function') {
    return Array.from((value as { values(): Iterable<T> }).values());
  }
  return Object.values(value as Record<string, T>);
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Strip pings/mentions, collapse whitespace, and cap the text. */
export function sanitizeDiscordText(text: string, max = MAX_CONTENT_CHARS): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/(?<![\w@])@(everyone|here)\b/gi, '')
    .replace(/<@[!&]?\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** Extract http(s) URLs, trimming common trailing punctuation. */
export function extractUrls(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0] ?? '';
    const cleaned = raw.replace(/[),.;:!?]+$/g, '');
    if (cleaned) found.push(cleaned);
  }
  return found;
}

/** Normalize for dedup; fall back to a trimmed literal if unparseable. */
export function normalizeLink(link: string): string {
  try {
    return normalizeUrl(link);
  } catch {
    return link.trim();
  }
}

export function isDiscordLink(link: string): boolean {
  return DISCORD_LINK.test(link);
}

function imageFromAttachment(attachment: Record<string, unknown>): ExtractedImage | null {
  const url = safeString(attachment['url']) || safeString(attachment['proxyURL']);
  if (!url) return null;
  const name = safeString(attachment['name']);
  const contentType = safeString(attachment['contentType']);
  const looksLikeImage = contentType.startsWith('image/') || IMAGE_EXTENSION.test(name);
  if (!looksLikeImage) return null;
  return {
    url,
    name,
    contentType,
    size: Number(attachment['size'] ?? 0) || 0,
    width: typeof attachment['width'] === 'number' ? attachment['width'] : null,
    height: typeof attachment['height'] === 'number' ? attachment['height'] : null,
  };
}

function normalizeEmbed(raw: unknown): ExtractedEmbed {
  const embed =
    typeof (raw as { toJSON?: unknown })?.toJSON === 'function'
      ? (raw as { toJSON(): Record<string, unknown> }).toJSON()
      : (raw as Record<string, unknown>);
  const fields = toArray<Record<string, unknown>>(embed?.['fields']).map((field) => ({
    name: safeString(field['name']),
    value: safeString(field['value']),
  }));
  return {
    title: safeString(embed?.['title']),
    description: safeString(embed?.['description']),
    url: safeString(embed?.['url']),
    fields,
    imageUrl: safeString((embed?.['image'] as Record<string, unknown>)?.['url']),
    thumbnailUrl: safeString((embed?.['thumbnail'] as Record<string, unknown>)?.['url']),
  };
}

function embedImage(
  url: string,
  kind: 'image' | 'thumbnail',
  index: number,
): ExtractedImage | null {
  if (!url) return null;
  return {
    url,
    name: `embed-${kind}-${index}`,
    contentType: '',
    size: 0,
    width: null,
    height: null,
  };
}

function buttonLinks(components: unknown): string[] {
  const links: string[] = [];
  for (const row of toArray<Record<string, unknown>>(components)) {
    for (const component of toArray<Record<string, unknown>>(row['components'])) {
      const url = safeString(component['url']);
      if (url) links.push(url);
    }
  }
  return links;
}

function appendUnique(parts: string[], value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (parts.some((part) => part.includes(trimmed))) return;
  parts.push(trimmed);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeLink(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Extract everything the repost router needs from one Discord message.
 * Never throws on a malformed embed/attachment shape; unknown parts are
 * simply omitted (a missing flyer must not drop the announcement).
 */
export function extractMessage(msg: any, opts: ExtractMessageOptions): ExtractedMessage {
  const messageId = safeString(msg?.id);
  const guildId = safeString(msg?.guildId) || safeString(msg?.guild?.id);
  const channelId = safeString(msg?.channelId) || opts.sourceChannelId;

  const embeds = toArray<unknown>(msg?.embeds).map(normalizeEmbed);
  const parts: string[] = [];
  appendUnique(parts, safeString(msg?.content));
  for (const embed of embeds) {
    appendUnique(parts, embed.title);
    appendUnique(parts, embed.description);
    for (const field of embed.fields) {
      appendUnique(parts, field.name);
      appendUnique(parts, field.value);
    }
  }

  const rawText = parts.join('\n\n');
  const links = dedupeStrings([
    ...extractUrls(rawText),
    ...embeds.map((embed) => embed.url),
    ...buttonLinks(msg?.components),
  ]);

  const images: ExtractedImage[] = [];
  for (const attachment of toArray<Record<string, unknown>>(msg?.attachments)) {
    const image = imageFromAttachment(attachment);
    if (image) images.push(image);
  }
  embeds.forEach((embed, index) => {
    const image = embedImage(embed.imageUrl, 'image', index);
    if (image) images.push(image);
    const thumb = embedImage(embed.thumbnailUrl, 'thumbnail', index);
    if (thumb) images.push(thumb);
  });
  const uniqueImages: ExtractedImage[] = [];
  const seenImages = new Set<string>();
  for (const image of images) {
    if (seenImages.has(image.url)) continue;
    seenImages.add(image.url);
    uniqueImages.push(image);
    if (uniqueImages.length >= MAX_IMAGES) break;
  }

  const content = sanitizeDiscordText(rawText);
  const title = embeds.find((embed) => embed.title)?.title ?? '';
  const preferredLink = links.find((link) => !isDiscordLink(link)) ?? links[0] ?? '';

  let dedupKey: string;
  if (preferredLink) {
    dedupKey = hashUrl(normalizeLink(preferredLink));
  } else if (content || title) {
    const canonical = `${content.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500)}|${title
      .toLowerCase()
      .trim()}`;
    dedupKey = hashText(canonical);
  } else {
    // Image-only announcement: no cross-source key exists, so keep it unique.
    dedupKey = hashText(`message:${messageId}`);
  }

  return {
    messageId,
    sourceChannelId: opts.sourceChannelId,
    sourceServer: opts.sourceServer ?? safeString(msg?.guild?.name),
    sourceChannelName:
      opts.sourceChannelName ??
      safeString(msg?.channel?.name) ??
      safeString(msg?.author?.username),
    guildId,
    messageUrl:
      guildId && channelId && messageId
        ? `https://discord.com/channels/${guildId}/${channelId}/${messageId}`
        : '',
    content,
    embeds,
    links,
    images: uniqueImages,
    dedupKey,
  };
}

/** True when the message has something worth triaging/posting. */
export function hasPayload(extracted: ExtractedMessage): boolean {
  return extracted.content.length > 0 || extracted.links.length > 0 || extracted.images.length > 0;
}
