import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockResolveChannel: vi.fn(),
}));

vi.mock('./router-service.js', () => ({
  resolveChannel: hoisted.mockResolveChannel as unknown,
}));

vi.mock('@zod/db-hot/machine-events', () => ({
  recordMachineEvent: vi.fn(),
}));

import type { DiscordInboxRow } from '@zod/db-hot/schema';
import {
  buildRepostEmbed,
  buildRepostText,
  downloadImage,
  postClassifiedInbox,
  preferredLink,
} from './relay-post.js';

const log = { info: vi.fn(), warn: vi.fn() };

function makeRow(overrides: Partial<DiscordInboxRow> = {}): DiscordInboxRow {
  return {
    id: 'inbox-1',
    message_id: '1234567890',
    source_channel_id: 'source-1',
    source_server: 'Original Server',
    source_channel_name: 'announcements',
    guild_id: 'guild-1',
    message_url: 'https://discord.com/channels/guild-1/source-1/1234567890',
    content: 'National Hackathon 2026\nRegistration is open. Prize ₹1,00,000.',
    embed_json: [],
    links: ['https://hack.example.com/apply'],
    images: [],
    dedup_key: 'abc',
    status: 'classified',
    pipeline: 'events',
    target_channel: '#-online-1lakh-plus',
    classification: {},
    posted_message_id: '',
    attempts: 0,
    last_error: '',
    created: '2026-11-01T00:00:00.000Z',
    updated: '2026-11-01T00:00:00.000Z',
    ...overrides,
  } as DiscordInboxRow;
}

function makePb(row: DiscordInboxRow = makeRow()): any {
  const inbox = {
    getList: vi.fn().mockResolvedValue({ items: [row] }),
    update: vi.fn().mockResolvedValue({}),
  };
  return {
    inbox,
    pb: {
      collection: vi.fn(() => inbox),
    },
  };
}

beforeEach(() => {
  hoisted.mockResolveChannel.mockReset();
  log.info.mockReset();
  log.warn.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('repost embed', () => {
  it('builds author attribution, clickable link, and description', () => {
    const row = makeRow();
    const embed = buildRepostEmbed(row).toJSON();

    expect((embed.author as any).name).toBe('from Original Server');
    expect((embed.author as any).url).toBe(row.message_url);
    expect(embed.title).toBe('National Hackathon 2026');
    expect(embed.url).toBe('https://hack.example.com/apply');
    expect(embed.description).toContain('Registration is open');
    expect(embed.description).not.toContain('National Hackathon 2026');
  });

  it('falls back to external server when source is unknown', () => {
    const embed = buildRepostEmbed(makeRow({ source_server: '' })).toJSON();
    expect((embed.author as any).name).toBe('from external server');
  });

  it('uses the original embed title when present', () => {
    const row = makeRow({
      content: 'Some body text',
      embed_json: [{ title: 'Original Embed Title', description: 'Embed body' }],
    });
    const embed = buildRepostEmbed(row).toJSON();
    expect(embed.title).toBe('Original Embed Title');
  });

  it('keeps a single long line in the description when the title truncates', () => {
    const longLine = `Hackathon ${'x'.repeat(400)}`;
    const embed = buildRepostEmbed(makeRow({ content: longLine, links: [] })).toJSON();
    expect(embed.title).toHaveLength(256);
    expect(embed.description).toBe(longLine);
  });

  it('appends button-only links that are missing from the text', () => {
    const row = makeRow({
      content: 'Internship at Acme',
      links: ['https://acme.example.com/jobs/1'],
    });
    const embed = buildRepostEmbed(row).toJSON();
    expect(embed.description).toContain('https://acme.example.com/jobs/1');
  });

  it('sets an attachment image reference when a flyer was re-uploaded', () => {
    const embed = buildRepostEmbed(makeRow(), 'attachment://repost-1234567890-0.png').toJSON();
    expect((embed.image as any).url).toBe('attachment://repost-1234567890-0.png');
  });

  it('prefers non-Discord links', () => {
    expect(
      preferredLink({ links: ['https://discord.gg/abc', 'https://unstop.com/event/1'] } as any),
    ).toBe('https://unstop.com/event/1');
  });

  it('builds plain text with attribution as a last-resort shape', () => {
    const text = buildRepostText(makeRow());
    expect(text).toContain('National Hackathon 2026');
    expect(text).toContain('https://hack.example.com/apply');
    expect(text).toContain('from Original Server');
  });
});

describe('downloadImage', () => {
  it('accepts image content and rejects non-image content', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: (name: string) => (name === 'content-type' ? 'image/png' : '3') },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: (name: string) => (name === 'content-type' ? 'text/html' : '3') },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    vi.stubGlobal('fetch', fetchMock);

    const image = {
      url: 'https://cdn.example.com/flyer.png',
      name: 'flyer.png',
      contentType: 'image/png',
      size: 3,
      width: null,
      height: null,
    } as any;

    const ok = await downloadImage(image, 0, '1234567890');
    expect(ok?.name).toBe('repost-1234567890-0.png');
    expect(ok?.data.byteLength).toBe(3);

    const rejected = await downloadImage(image, 1, '1234567890');
    expect(rejected).toBeNull();
  });

  it('returns null when fetch throws or the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const image = {
      url: 'https://cdn.example.com/flyer.png',
      name: '',
      contentType: '',
      size: 0,
      width: null,
      height: null,
    } as any;
    expect(await downloadImage(image, 0, '1')).toBeNull();
  });
});

describe('postClassifiedInbox', () => {
  it('posts a classified row, uploads the flyer, and records posted_message_id', async () => {
    const row = makeRow({
      images: [
        {
          url: 'https://cdn.example.com/flyer.png',
          name: 'flyer.png',
          contentType: 'image/png',
          size: 3,
          width: null,
          height: null,
        },
      ],
    });
    const { pb, inbox } = makePb(row);
    const channel = { send: vi.fn().mockResolvedValue({ id: 'posted-1' }) };
    hoisted.mockResolveChannel.mockResolvedValue(channel);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: (name: string) => (name === 'content-type' ? 'image/png' : '3') },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }),
    );

    const result = await postClassifiedInbox({
      env: {} as any,
      log,
      pb,
      client: {},
    });

    expect(result).toEqual({ visited: 1, posted: 1, errors: 0 });
    const payload = channel.send.mock.calls[0][0];
    expect(payload.allowedMentions).toEqual({ parse: [] });
    expect(payload.files).toHaveLength(1);
    expect(payload.embeds[0].toJSON().image.url).toBe(
      'attachment://repost-1234567890-0.png',
    );
    expect(inbox.update).toHaveBeenCalledWith('inbox-1', {
      status: 'posted',
      posted_message_id: 'posted-1',
      last_error: '',
    });
  });

  it('falls back to the original image URL when download fails', async () => {
    const row = makeRow({
      images: [
        {
          url: 'https://cdn.example.com/flyer.png',
          name: '',
          contentType: '',
          size: 0,
          width: null,
          height: null,
        },
      ],
    });
    const { pb } = makePb(row);
    const channel = { send: vi.fn().mockResolvedValue({ id: 'posted-2' }) };
    hoisted.mockResolveChannel.mockResolvedValue(channel);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('cdn down')));

    const result = await postClassifiedInbox({ env: {} as any, log, pb, client: {} });

    expect(result.posted).toBe(1);
    const payload = channel.send.mock.calls[0][0];
    expect(payload.files).toBeUndefined();
    expect(payload.embeds[0].toJSON().image.url).toBe('https://cdn.example.com/flyer.png');
  });

  it('keeps classified status with attempts incremented after a send error', async () => {
    const { pb, inbox } = makePb(makeRow({ attempts: 1 }));
    const channel = { send: vi.fn().mockRejectedValue(new Error('send failed')) };
    hoisted.mockResolveChannel.mockResolvedValue(channel);

    const result = await postClassifiedInbox({ env: {} as any, log, pb, client: {} });

    expect(result.errors).toBe(1);
    expect(inbox.update).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ attempts: 2, status: 'classified' }),
    );
  });

  it('marks the row error after five failed attempts', async () => {
    const { pb, inbox } = makePb(makeRow({ attempts: 4 }));
    hoisted.mockResolveChannel.mockResolvedValue({
      send: vi.fn().mockRejectedValue(new Error('send failed')),
    });

    await postClassifiedInbox({ env: {} as any, log, pb, client: {} });

    expect(inbox.update).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ attempts: 5, status: 'error' }),
    );
  });

  it('records a retry when the target channel cannot be resolved', async () => {
    const { pb, inbox } = makePb();
    hoisted.mockResolveChannel.mockResolvedValue(null);

    await postClassifiedInbox({ env: {} as any, log, pb, client: {} });

    expect(inbox.update).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({ attempts: 1, status: 'classified' }),
    );
  });

  it('defers when the discord client is not ready', async () => {
    const { pb, inbox } = makePb();
    const result = await postClassifiedInbox({ env: {} as any, log, pb, client: null });
    expect(result).toEqual({ visited: 0, posted: 0, errors: 0 });
    expect(inbox.getList).not.toHaveBeenCalled();
  });
});
