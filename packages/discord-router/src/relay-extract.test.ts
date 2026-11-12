import { describe, expect, it } from 'vitest';
import {
  extractMessage,
  extractUrls,
  hasPayload,
  isDiscordLink,
  sanitizeDiscordText,
} from './relay-extract.js';

const opts = { sourceChannelId: 'source-1' };

describe('relay-extract', () => {
  it('extracts text, external link, and flyer attachment', () => {
    const msg = {
      id: '100',
      guildId: 'guild-1',
      content: 'National Hackathon 2026 — register now! https://hack.example.com/apply',
      embeds: [],
      components: [],
      attachments: [
        {
          url: 'https://cdn.discordapp.com/flyer.png',
          name: 'flyer.png',
          contentType: 'image/png',
          size: 1234,
          width: 800,
          height: 600,
        },
        {
          url: 'https://cdn.discordapp.com/rules.pdf',
          name: 'rules.pdf',
          contentType: 'application/pdf',
          size: 999,
        },
      ],
    };

    const extracted = extractMessage(msg, opts);

    expect(extracted.content).toContain('National Hackathon 2026');
    expect(extracted.links).toContain('https://hack.example.com/apply');
    expect(extracted.images).toHaveLength(1);
    expect(extracted.images[0]?.url).toBe('https://cdn.discordapp.com/flyer.png');
    expect(extracted.messageUrl).toBe(
      'https://discord.com/channels/guild-1/source-1/100',
    );
    expect(hasPayload(extracted)).toBe(true);
  });

  it('extracts embed-only announcements including embed image', () => {
    const msg = {
      id: '101',
      guildId: 'guild-1',
      content: '',
      embeds: [
        {
          toJSON: () => ({
            title: 'Cloud Workshop',
            description: 'Hands-on Kubernetes workshop',
            url: 'https://events.example.com/cloud',
            fields: [{ name: 'Date', value: '12 Dec 2026' }],
            image: { url: 'https://cdn.example.com/banner.jpg' },
          }),
        },
      ],
      components: [],
      attachments: [],
    };

    const extracted = extractMessage(msg, opts);

    expect(extracted.content).toContain('Cloud Workshop');
    expect(extracted.content).toContain('Hands-on Kubernetes');
    expect(extracted.content).toContain('Date');
    expect(extracted.links).toContain('https://events.example.com/cloud');
    expect(extracted.images[0]?.url).toBe('https://cdn.example.com/banner.jpg');
  });

  it('extracts link-style button URLs', () => {
    const msg = {
      id: '102',
      content: 'Internship opening at Acme',
      embeds: [],
      components: [
        {
          components: [
            { type: 2, style: 5, label: 'Apply', url: 'https://acme.example.com/jobs/1' },
          ],
        },
      ],
      attachments: [],
    };

    const extracted = extractMessage(msg, opts);
    expect(extracted.links).toEqual(['https://acme.example.com/jobs/1']);
    expect(extracted.dedupKey).toHaveLength(64);
  });

  it('keeps image-only messages as payloads but has no text', () => {
    const msg = {
      id: '103',
      content: '',
      embeds: [],
      components: [],
      attachments: [
        {
          url: 'https://cdn.discordapp.com/flyer-only.webp',
          name: 'flyer-only.webp',
          contentType: 'image/webp',
          size: 42,
        },
      ],
    };

    const extracted = extractMessage(msg, opts);
    expect(extracted.content).toBe('');
    expect(extracted.images).toHaveLength(1);
    expect(hasPayload(extracted)).toBe(true);
  });

  it('supports no-link/no-flyer text messages', () => {
    const msg = {
      id: '104',
      content: 'Free swag giveaway for students — claim your voucher today',
      embeds: [],
      components: [],
      attachments: [],
    };

    const extracted = extractMessage(msg, opts);
    expect(extracted.content).toContain('Free swag giveaway');
    expect(extracted.links).toEqual([]);
    expect(extracted.images).toEqual([]);
    expect(extracted.dedupKey).toHaveLength(64);
    expect(hasPayload(extracted)).toBe(true);
  });

  it('strips mentions and caps content length', () => {
    const msg = {
      id: '105',
      content: `@everyone <@123> <@&456> Hello\u200b   there\n\n\n${'x'.repeat(9000)}`,
      embeds: [],
      components: [],
      attachments: [],
    };

    const extracted = extractMessage(msg, opts);
    expect(extracted.content).not.toContain('@everyone');
    expect(extracted.content).not.toContain('<@123>');
    expect(extracted.content).not.toContain('<@&456>');
    expect(extracted.content.length).toBeLessThanOrEqual(8000);
  });

  it('prefers a non-Discord link for the dedup key', () => {
    const msg = {
      id: '106',
      content: 'Event: https://discord.gg/abc external: https://unstop.com/event/1',
      embeds: [],
      components: [],
      attachments: [],
    };

    const withDiscordFirst = extractMessage(msg, opts);
    const withExternalOnly = extractMessage(
      { ...msg, id: '107', content: 'Event: https://unstop.com/event/1' },
      opts,
    );
    expect(withDiscordFirst.dedupKey).toBe(withExternalOnly.dedupKey);
    expect(isDiscordLink('https://discord.gg/abc')).toBe(true);
    expect(isDiscordLink('https://unstop.com/event/1')).toBe(false);
  });

  it('deduplicates repeated links and images', () => {
    const msg = {
      id: '108',
      content: 'Apply https://example.com/apply and https://example.com/apply',
      embeds: [
        {
          title: 'Apply',
          description: '',
          url: 'https://example.com/apply',
          fields: [],
          imageUrl: 'https://cdn.example.com/flyer.png',
          thumbnailUrl: 'https://cdn.example.com/flyer.png',
        },
      ],
      components: [],
      attachments: [
        {
          url: 'https://cdn.example.com/flyer.png',
          name: 'flyer.png',
          contentType: 'image/png',
          size: 10,
        },
      ],
    };

    const extracted = extractMessage(msg, opts);
    expect(extracted.links).toEqual(['https://example.com/apply']);
    expect(extracted.images).toHaveLength(1);
  });

  it('handles malformed embeds/attachments without throwing', () => {
    const msg = {
      id: '109',
      content: 'Workshop registration open',
      embeds: [{}],
      components: [{ components: [{}] }],
      attachments: [{}, { url: null }],
    };

    expect(() => extractMessage(msg, opts)).not.toThrow();
  });
});

describe('sanitizeDiscordText / extractUrls', () => {
  it('collapses whitespace and trims trailing punctuation from URLs', () => {
    expect(sanitizeDiscordText('  hello   world  ')).toBe('hello world');
    expect(extractUrls('Apply at https://example.com/apply).')).toEqual([
      'https://example.com/apply',
    ]);
  });

  it('caps text at the provided maximum', () => {
    expect(sanitizeDiscordText('a'.repeat(100), 10)).toHaveLength(10);
  });
});
