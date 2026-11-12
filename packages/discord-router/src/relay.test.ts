import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockGetClient: vi.fn(),
  mockCreatePbClient: vi.fn(),
  mockCreateLogger: vi.fn(),
  mockPostClassified: vi.fn(),
}));

const {
  mockGetClient,
  mockCreatePbClient,
  mockCreateLogger,
  mockPostClassified,
} = hoisted;

vi.mock('./gateway.js', () => ({
  getClient: hoisted.mockGetClient as unknown,
}));

vi.mock('@zod/db-hot', () => ({
  createPbClient: hoisted.mockCreatePbClient as unknown,
}));

vi.mock('@zod/db-hot/machine-events', () => ({
  recordMachineEvent: vi.fn(),
}));

vi.mock('@zod/logger', () => ({
  createLogger: hoisted.mockCreateLogger as unknown,
}));

vi.mock('./relay-post.js', () => ({
  postClassifiedInbox: hoisted.mockPostClassified as unknown,
}));

import { createRelayService, startRelayService, cursorSlotFor, isNotFoundError } from './relay.js';

function notFound(): Error & { status: number } {
  const error = new Error('404 not found') as Error & { status: number };
  error.status = 404;
  return error;
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

interface PbMocks {
  agent: {
    getFirstListItem: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  inbox: {
    getFirstListItem: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    getList: ReturnType<typeof vi.fn>;
  };
  pb: any;
}

function makePb(): PbMocks {
  const agent = {
    getFirstListItem: vi.fn().mockRejectedValue(notFound()),
    create: vi.fn().mockResolvedValue({ id: 'cursor-row' }),
    update: vi.fn().mockResolvedValue({}),
  };
  const inbox = {
    getFirstListItem: vi.fn().mockRejectedValue(notFound()),
    create: vi.fn().mockResolvedValue({ id: 'inbox-row' }),
    update: vi.fn().mockResolvedValue({}),
    getList: vi.fn().mockResolvedValue({ items: [] }),
  };
  const pb = {
    collection: vi.fn((name: string) => {
      if (name === 'agent_telemetry') return agent;
      if (name === 'discord_inbox') return inbox;
      return { create: vi.fn().mockResolvedValue({}) };
    }),
  };
  return { agent, inbox, pb };
}

function makeSource(
  messages: Array<Record<string, unknown>>,
  honoursAfter = true,
): any {
  return {
    isTextBased: () => true,
    messages: {
      fetch: vi.fn(async (options: { after?: string }) => {
        const filtered =
          honoursAfter && options.after
            ? messages.filter((msg) => String(msg.id) > options.after!)
            : messages;
        return new Map(filtered.map((msg) => [String(msg.id), msg]));
      }),
    },
  };
}

function makeClient(sourceChannel: any, webhook?: unknown): any {
  return {
    channels: { fetch: vi.fn().mockResolvedValue(sourceChannel) },
    fetchWebhook: vi.fn().mockResolvedValue(webhook),
  };
}

function env(overrides: Record<string, unknown> = {}): any {
  return {
    DISCORD_RELAY_SOURCE_CHANNEL_ID: 'source-123',
    DISCORD_CHANNEL_RELAY: 'relay-456',
    DISCORD_RELAY_MIRROR_RAW: 'false',
    ...overrides,
  };
}

beforeEach(() => {
  hoisted.mockGetClient.mockReset();
  hoisted.mockCreatePbClient.mockReset();
  hoisted.mockCreateLogger.mockReset();
  hoisted.mockPostClassified.mockReset();
  mockLogger.info.mockReset();
  mockLogger.warn.mockReset();
  mockLogger.debug.mockReset();
  mockCreateLogger.mockReturnValue(mockLogger);
  mockPostClassified.mockResolvedValue({ visited: 0, posted: 0, errors: 0 });
});

describe('relay service (ING-04, D-04)', () => {
  it('skips when the discord client is not ready', async () => {
    mockGetClient.mockReturnValue(null);

    const svc = createRelayService({ env: env(), log: mockLogger as any });

    await svc.tick();
    expect(mockGetClient).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('still runs the repost stage when no source channels are configured', async () => {
    const client = makeClient(makeSource([]));
    const { pb } = makePb();

    const svc = createRelayService({
      env: env({ DISCORD_RELAY_SOURCE_CHANNEL_ID: '', DISCORD_RELAY_SOURCE_CHANNEL_ID_1: '' }),
      log: mockLogger as any,
      pb,
      client,
    });

    await svc.tick();
    expect(mockPostClassified).toHaveBeenCalledTimes(1);
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it('initializes a missing cursor at the newest message without replaying history', async () => {
    const source = makeSource([
      { id: 'msg1', guildId: 'guild-1', content: 'Hackathon 2026 registration open https://hack.example.com', embeds: [], attachments: [], components: [] },
      { id: 'msg2', guildId: 'guild-1', content: 'Second announcement', embeds: [], attachments: [], components: [] },
    ]);
    const client = makeClient(source);
    const { agent, inbox, pb } = makePb();

    const svc = createRelayService({ env: env(), log: mockLogger as any, pb, client });
    await svc.tick();

    expect(source.messages.fetch).toHaveBeenCalledWith({ limit: 1 });
    expect(inbox.create).not.toHaveBeenCalled();
    expect(agent.create).toHaveBeenCalledTimes(1);
    expect(agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slot: cursorSlotFor('source-123'),
        provider: 'discord',
        model: 'gateway',
        step: 'relay',
        status: 'done',
        detail: 'msg2',
        duration_ms: 0,
      }),
    );
    expect(mockPostClassified).toHaveBeenCalledTimes(1);
  });

  it('captures new messages after an existing cursor and updates the cursor row', async () => {
    const source = makeSource([
      { id: 'msg1', guildId: 'guild-1', content: 'Hackathon 2026 registration open https://hack.example.com', embeds: [], attachments: [], components: [] },
      { id: 'msg2', guildId: 'guild-1', content: 'Second announcement', embeds: [], attachments: [], components: [] },
    ]);
    const client = makeClient(source);
    const { agent, inbox, pb } = makePb();
    agent.getFirstListItem.mockResolvedValue({ id: 'cursor-row', detail: 'msg0' });

    const svc = createRelayService({ env: env(), log: mockLogger as any, pb, client });
    await svc.tick();

    expect(inbox.create).toHaveBeenCalledTimes(2);
    expect(inbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message_id: 'msg1',
        source_channel_id: 'source-123',
        status: 'pending',
      }),
    );
    expect(agent.update).toHaveBeenCalledWith('cursor-row', { detail: 'msg2' });
    expect(agent.create).not.toHaveBeenCalled();
    expect(mockPostClassified).toHaveBeenCalledTimes(1);
  });

  it('does not create duplicate inbox rows or cursor rows on a second tick', async () => {
    const source = makeSource([
      { id: 'msg1', content: 'Hackathon registration https://hack.example.com', embeds: [], attachments: [], components: [] },
    ]);
    const client = makeClient(source);
    const { agent, inbox, pb } = makePb();

    let cursor = 'msg0';
    agent.getFirstListItem.mockImplementation(async () => ({
      id: 'cursor-row',
      detail: cursor,
    }));
    agent.update.mockImplementation(async (_id: string, data: { detail?: string }) => {
      cursor = data.detail ?? cursor;
      return {};
    });

    const svc = createRelayService({ env: env(), log: mockLogger as any, pb, client });
    await svc.tick();
    expect(inbox.create).toHaveBeenCalledTimes(1);

    await svc.tick();
    expect(inbox.create).toHaveBeenCalledTimes(1);
    expect(agent.create).not.toHaveBeenCalled();
    expect(agent.update).toHaveBeenCalledTimes(1);
  });

  it('updates an existing cursor row instead of creating a new one', async () => {
    const source = makeSource([
      { id: 'msg2', content: 'Webinar on cloud credits https://example.com/webinar', embeds: [], attachments: [], components: [] },
    ]);
    const client = makeClient(source);
    const { agent, inbox, pb } = makePb();
    agent.getFirstListItem.mockResolvedValue({ id: 'cursor-row', detail: 'msg1' });

    const svc = createRelayService({ env: env(), log: mockLogger as any, pb, client });
    await svc.tick();

    expect(inbox.create).toHaveBeenCalledTimes(1);
    expect(agent.update).toHaveBeenCalledWith('cursor-row', { detail: 'msg2' });
    expect(agent.create).not.toHaveBeenCalled();
  });

  it('skips a source on a non-404 cursor read error (no history replay)', async () => {
    const source = makeSource([
      { id: 'msg1', content: 'Hackathon https://hack.example.com', embeds: [], attachments: [], components: [] },
    ]);
    const client = makeClient(source);
    const { agent, inbox, pb } = makePb();
    agent.getFirstListItem.mockRejectedValue(new Error('PB unavailable'));

    const svc = createRelayService({ env: env(), log: mockLogger as any, pb, client });
    await svc.tick();

    expect(inbox.create).not.toHaveBeenCalled();
    expect(source.messages.fetch).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('does not advance the cursor past a failed capture', async () => {
    const source = makeSource([
      { id: 'msg1', content: 'Hackathon https://hack.example.com', embeds: [], attachments: [], components: [] },
      { id: 'msg2', content: 'Second https://example.com/2', embeds: [], attachments: [], components: [] },
    ]);
    const client = makeClient(source);
    const { agent, inbox, pb } = makePb();
    agent.getFirstListItem.mockResolvedValue({ id: 'cursor-row', detail: 'msg0' });
    inbox.create.mockRejectedValueOnce(new Error('write failed'));

    const svc = createRelayService({ env: env(), log: mockLogger as any, pb, client });
    await svc.tick();

    // msg1 failed, msg2 never attempted, and no cursor was persisted.
    expect(inbox.create).toHaveBeenCalledTimes(1);
    expect(agent.create).not.toHaveBeenCalled();
    expect(agent.update).not.toHaveBeenCalled();
  });

  it('dedups the same external link captured from another source', async () => {
    const source = makeSource([
      { id: 'msg9', content: 'Hackathon https://hack.example.com', embeds: [], attachments: [], components: [] },
    ]);
    const client = makeClient(source);
    const { agent, inbox, pb } = makePb();
    agent.getFirstListItem.mockResolvedValue({ id: 'cursor-row', detail: 'msg0' });
    inbox.getFirstListItem.mockImplementation(async (filter: string) => {
      if (filter.includes('dedup_key')) return { id: 'existing' };
      throw notFound();
    });

    const svc = createRelayService({ env: env(), log: mockLogger as any, pb, client });
    await svc.tick();

    expect(inbox.create).not.toHaveBeenCalled();
    expect(agent.update).toHaveBeenCalledWith('cursor-row', { detail: 'msg9' });
  });

  it('resolves source attribution from the follower webhook', async () => {
    const source = makeSource([
      { id: 'msg1', webhookId: 'wh-1', content: 'Hackathon https://hack.example.com', embeds: [], attachments: [], components: [] },
    ]);
    const client = makeClient(source, {
      sourceGuild: { name: 'Original Server' },
      sourceChannel: { name: 'announcements' },
    });
    const { agent, inbox, pb } = makePb();
    agent.getFirstListItem.mockResolvedValue({ id: 'cursor-row', detail: 'msg0' });

    const svc = createRelayService({ env: env(), log: mockLogger as any, pb, client });
    await svc.tick();

    expect(inbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source_server: 'Original Server',
        source_channel_name: 'announcements',
      }),
    );
    expect(client.fetchWebhook).toHaveBeenCalledWith('wh-1');
  });

  it('sends the optional raw mirror when enabled', async () => {
    const source = makeSource([
      { id: 'msg1', content: 'Hackathon https://hack.example.com', embeds: [], attachments: [], components: [] },
    ]);
    const mirror = {
      send: vi.fn().mockResolvedValue({}),
      isTextBased: () => true,
      isDMBased: () => false,
    };
    const client = {
      channels: {
        fetch: vi.fn(async (id: string) => (id === 'relay-456' ? mirror : source)),
      },
      fetchWebhook: vi.fn(),
    };
    const { agent, pb } = makePb();
    agent.getFirstListItem.mockResolvedValue({ id: 'cursor-row', detail: 'msg0' });

    const svc = createRelayService({
      env: env({ DISCORD_RELAY_MIRROR_RAW: 'true' }),
      log: mockLogger as any,
      pb,
      client,
    });
    await svc.tick();

    expect(mirror.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Hackathon') }),
    );
  });

  it('startRelayService returns a RelayService with tick and stop', () => {
    mockGetClient.mockReturnValue({} as any);

    const svc = startRelayService({ env: env(), log: mockLogger as any });
    expect(typeof svc.tick).toBe('function');
    expect(typeof svc.stop).toBe('function');
  });
});

describe('isNotFoundError', () => {
  it('recognizes PocketBase status/code/message forms', () => {
    expect(isNotFoundError({ status: 404 })).toBe(true);
    expect(isNotFoundError({ statusCode: 404 })).toBe(true);
    expect(isNotFoundError({ code: 404 })).toBe(true);
    expect(isNotFoundError(new Error('404 not found'))).toBe(true);
    expect(isNotFoundError(new Error('network down'))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
