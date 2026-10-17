import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockGetClient: vi.fn(),
  mockCreatePbClient: vi.fn(),
  mockCreateLogger: vi.fn(),
}));

const { mockGetClient, mockCreatePbClient, mockCreateLogger } = hoisted;

vi.mock('./gateway.js', () => ({
  getClient: hoisted.mockGetClient as unknown,
}));

vi.mock('@zod/db-hot', () => ({
  createPbClient: hoisted.mockCreatePbClient as unknown,
}));

vi.mock('@zod/logger', () => ({
  createLogger: hoisted.mockCreateLogger as unknown,
}));

import { createTasteIngestionHandler, parseRuleCommand } from './taste-ingest.js';

beforeEach(() => {
  hoisted.mockGetClient.mockReset();
  hoisted.mockCreatePbClient.mockReset();
  hoisted.mockCreateLogger.mockReset();
});

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

function makePbMock(collectionOverrides: Record<string, any> = {}): any {
  const created: any[] = [];
  const collection = {
    getList: vi.fn(),
    create: vi.fn().mockImplementation(async (data: any) => {
      created.push(data);
      return { id: `tr-${created.length}`, ...data };
    }),
    __created__: created,
    ...collectionOverrides,
  };
  return { collection: vi.fn(() => collection) };
}

const testEnv = {
  DISCORD_TOKEN: 'test-token',
  DISCORD_CHANNEL_TRAINING: 'channel-training-123',
} as any;

// ---------------------------------------------------------------------------
// parseRuleCommand tests
// ---------------------------------------------------------------------------

describe('parseRuleCommand', () => {
  it('parses !rule BLOCK <text>', () => {
    const result = parseRuleCommand('!rule BLOCK no crypto events');
    expect(result).toEqual({ kind: 'BLOCK', rule: 'no crypto events' });
  });

  it('parses !rule BOOST <text>', () => {
    const result = parseRuleCommand('!rule BOOST AI hackathons');
    expect(result).toEqual({ kind: 'BOOST', rule: 'AI hackathons' });
  });

  it('parses !rule WEIGHT <value> <text>', () => {
    const result = parseRuleCommand('!rule WEIGHT 2.5 prioritize student events');
    expect(result).toEqual({ kind: 'WEIGHT', rule: 'prioritize student events', weight: 2.5 });
  });

  it('parses !rule WEIGHT <int> <text>', () => {
    const result = parseRuleCommand('!rule WEIGHT 3 remote-first');
    expect(result).toEqual({ kind: 'WEIGHT', rule: 'remote-first', weight: 3 });
  });

  it('parses !rule CUSTOM <text>', () => {
    const result = parseRuleCommand('!rule CUSTOM anything about rust');
    expect(result).toEqual({ kind: 'CUSTOM', rule: 'anything about rust' });
  });

  it('uppercases unknown kind as-is', () => {
    const result = parseRuleCommand('!rule FOOBAR something');
    expect(result.kind).toBe('FOOBAR');
    expect(result.rule).toBe('something');
  });

  it('handles extra whitespace', () => {
    const result = parseRuleCommand('!rule   BLOCK   scam events   ');
    expect(result).toEqual({ kind: 'BLOCK', rule: 'scam events' });
  });
});

// ---------------------------------------------------------------------------
// Taste ingestion handler tests
// ---------------------------------------------------------------------------

describe('taste ingestion handler (D-11, T-6-10, Pitfall 9)', () => {
  it('does not start when discord client is not ready', () => {
    hoisted.mockGetClient.mockReturnValue(null);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const handler = createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
    });

    expect(handler.stop).toBeTypeOf('function');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'discord client not ready; taste ingestion handler not started',
    );
  });

  it('ignores bot reactions', async () => {
    const client = { on: vi.fn() };
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
      client: client as any,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];
    expect(handlerFn).toBeTypeOf('function');

    await handlerFn(
      { emoji: { name: '👍' }, message: { id: 'msg-1', partial: false, reply: vi.fn() } },
      { bot: true },
    );

    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(String) }),
      'taste ingestion reaction handler error',
    );
  });

  it('creates BOOST rule on 👍 reaction (non-bot)', async () => {
    const created: any[] = [];
    const pb = makePbMock({
      create: vi.fn().mockImplementation(async (data: any) => {
        created.push(data);
        return { id: 'tr-1', ...data };
      }),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];

    const reaction = {
      emoji: { name: '👍' },
      message: {
        id: 'msg-1',
        partial: false,
        embeds: [{ title: 'NITK Tech Fest 2026', url: 'https://nitk.edu.in/fest' }],
        reply: vi.fn().mockResolvedValue(undefined),
      },
    };
    const user = { bot: false };

    await handlerFn(reaction, user);

    expect(pb.collection('taste_rules').create).toHaveBeenCalledWith({
      kind: 'BOOST',
      rule: 'Prefer: NITK Tech Fest 2026 — https://nitk.edu.in/fest',
      weight: 1.0,
      source: 'reaction',
    });
    expect(reaction.message.reply).toHaveBeenCalledWith(
      '✅ Taste rule created: BOOST — Prefer: NITK Tech Fest 2026 — https://nitk.edu.in/fest',
    );
  });

  it('creates BLOCK rule on 👎 reaction (non-bot)', async () => {
    const created: any[] = [];
    const pb = makePbMock({
      create: vi.fn().mockImplementation(async (data: any) => {
        created.push(data);
        return { id: 'tr-1', ...data };
      }),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];

    const reaction = {
      emoji: { name: '👎' },
      message: {
        id: 'msg-2',
        partial: false,
        embeds: [{ title: 'Paid Crypto Workshop' }],
        reply: vi.fn().mockResolvedValue(undefined),
      },
    };
    const user = { bot: false };

    await handlerFn(reaction, user);

    expect(pb.collection('taste_rules').create).toHaveBeenCalledWith({
      kind: 'BLOCK',
      rule: 'Reject: Paid Crypto Workshop',
      weight: 1.0,
      source: 'reaction',
    });
    expect(reaction.message.reply).toHaveBeenCalledWith(
      '✅ Taste rule created: BLOCK — Reject: Paid Crypto Workshop',
    );
  });

  it('ignores non-👍/👎 reactions', async () => {
    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];

    await handlerFn(
      { emoji: { name: '❤️' }, message: { id: 'msg-1', partial: false, reply: vi.fn() } },
      { bot: false },
    );

    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(String) }),
      'taste ingestion reaction handler error',
    );
  });

  it('fetches partial message before processing (Pitfall 2)', async () => {
    let fetched = false;
    const pb = makePbMock();
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];

    const reaction = {
      emoji: { name: '👍' },
      message: {
        id: 'msg-1',
        partial: true,
        fetch: vi.fn().mockImplementation(async () => {
          fetched = true;
        }),
        embeds: [{ title: 'Test Event' }],
        reply: vi.fn().mockResolvedValue(undefined),
      },
    };
    const user = { bot: false };

    await handlerFn(reaction, user);

    expect(fetched).toBe(true);
  });

  it('creates rule from !rule keyword command in training channel', async () => {
    const pb = makePbMock();
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageCreate')?.[1];

    const msg = {
      author: { bot: false },
      channelId: 'channel-training-123',
      content: '!rule BLOCK pay-to-join scams',
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await handlerFn(msg);

    expect(pb.collection('taste_rules').create).toHaveBeenCalledWith({
      kind: 'BLOCK',
      rule: 'pay-to-join scams',
      weight: 1.0,
      source: 'keyword',
    });
    expect(msg.reply).toHaveBeenCalledWith(
      '✅ Taste rule created: BLOCK — pay-to-join scams',
    );
  });

  it('ignores !rule command outside training channel', async () => {
    const pb = makePbMock();
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageCreate')?.[1];

    const msg = {
      author: { bot: false },
      channelId: 'other-channel',
      content: '!rule BLOCK something',
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await handlerFn(msg);

    expect(pb.collection('taste_rules').create).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('creates rule from DM to bot', async () => {
    const pb = makePbMock();
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageCreate')?.[1];

    const msg = {
      author: { bot: false },
      channel: { type: 'DM' },
      guild: null,
      content: '!rule BOOST student hackathons',
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await handlerFn(msg);

    expect(pb.collection('taste_rules').create).toHaveBeenCalledWith({
      kind: 'BOOST',
      rule: 'student hackathons',
      weight: 1.0,
      source: 'dm',
    });
    expect(msg.reply).toHaveBeenCalledWith(
      '✅ Taste rule created: BOOST — student hackathons',
    );
  });

  it('ignores non-!rule messages in training channel', async () => {
    const pb = makePbMock();
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageCreate')?.[1];

    const msg = {
      author: { bot: false },
      channelId: 'channel-training-123',
      content: 'hello everyone',
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await handlerFn(msg);

    expect(pb.collection('taste_rules').create).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('parses WEIGHT with decimal value from keyword command', async () => {
    const pb = makePbMock();
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createTasteIngestionHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageCreate')?.[1];

    const msg = {
      author: { bot: false },
      channelId: 'channel-training-123',
      content: '!rule WEIGHT 1.5 prioritize NITK events',
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await handlerFn(msg);

    expect(pb.collection('taste_rules').create).toHaveBeenCalledWith({
      kind: 'WEIGHT',
      rule: 'prioritize NITK events',
      weight: 1.5,
      source: 'keyword',
    });
  });
});
