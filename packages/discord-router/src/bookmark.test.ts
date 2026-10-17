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

import { createBookmarkHandler, startBookmarkHandler } from './bookmark.js';

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
  const collection = {
    getList: vi.fn(),
    update: vi.fn(),
    ...collectionOverrides,
  };
  return { collection: vi.fn(() => collection) };
}

const testEnv = {
  BOOKMARK_EMOJI_ID: 'emoji-123',
  DISCORD_TOKEN: 'test-token',
} as any;

const fixtureOpp = {
  id: 'opp-1',
  bucket_channel: '#🔥-priority-sys-cp-sec',
  deadlines: {
    tba: false,
    event_start: '2026-12-15T09:00:00Z',
    apply_by: '2026-12-01T23:59:59Z',
  },
};

describe('bookmark handler (UI-02, D-05, D-06)', () => {
  it('does not start when discord client is not ready', () => {
    hoisted.mockGetClient.mockReturnValue(null);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const handler = createBookmarkHandler({
      env: testEnv,
      log: mockLogger as any,
    });

    expect(handler.stop).toBeTypeOf('function');
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('ignores bot reactions (T-6-08)', async () => {
    const client = { on: vi.fn() };
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createBookmarkHandler({
      env: testEnv,
      log: mockLogger as any,
      client: client as any,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];
    expect(handlerFn).toBeTypeOf('function');

    // Simulate a bot reaction
    await handlerFn(
      { emoji: { id: 'emoji-123' }, message: { id: 'msg-1', partial: false, reply: vi.fn() } },
      { bot: true },
    );

    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(String) }),
      'bookmark reaction handler error',
    );
  });

  it('ignores non-matching emoji', async () => {
    const client = { on: vi.fn() };
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createBookmarkHandler({
      env: testEnv,
      log: mockLogger as any,
      client: client as any,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];

    await handlerFn(
      { emoji: { id: 'other-emoji' }, message: { id: 'msg-1', partial: false, reply: vi.fn() } },
      { bot: false },
    );

    // No error, no PB calls — just silently ignored
    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(String) }),
      'bookmark reaction handler error',
    );
  });

  it('sets bookmark=true and arms 48h/24h reminders on matching custom emoji reaction', async () => {
    const sentReplies: any[] = [];
    const pbUpdates: any[] = [];
    const pb = makePbMock({
      getList: vi.fn().mockResolvedValue({
        items: [{ ...fixtureOpp, id: 'opp-1', discord_message_id: 'msg-1' }],
      }),
      update: vi.fn().mockImplementation((id: string, data: any) => {
        pbUpdates.push([id, data]);
        return Promise.resolve();
      }),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = {
      on: vi.fn(),
      channels: {},
    } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createBookmarkHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];

    const reaction = {
      emoji: { id: 'emoji-123' },
      message: {
        id: 'msg-1',
        partial: false,
        reply: vi.fn().mockResolvedValue(undefined),
      },
    };
    const user = { bot: false };

    await handlerFn(reaction, user);

    expect(pb.collection('opportunities').getList).toHaveBeenCalledWith(1, 1, {
      filter: "discord_message_id = 'msg-1'",
    });
    expect(pbUpdates).toHaveLength(1);
    expect(pbUpdates[0][0]).toBe('opp-1');
    expect(pbUpdates[0][1].bookmark).toBe(true);
    expect(pbUpdates[0][1].reminders).toHaveLength(2);
    // 48h and 24h reminders both in the future (event is Dec 2026)
    expect(pbUpdates[0][1].reminders[0].sent).toBe(false);
    expect(pbUpdates[0][1].reminders[1].sent).toBe(false);
    expect(pbUpdates[0][1].reminders[0].channel).toBe('#🔥-priority-sys-cp-sec');
    expect(pbUpdates[0][1].reminders[1].channel).toBe('#🔥-priority-sys-cp-sec');
    expect(reaction.message.reply).toHaveBeenCalledWith(
      '🔖 Bookmarked — you will get 48h and 24h reminders before the deadline.',
    );
  });

  it('does not arm reminders in the past (anchor already passed)', async () => {
    const pbUpdates: any[] = [];
    const pb = makePbMock({
      getList: vi.fn().mockResolvedValue({
        items: [{ ...fixtureOpp, id: 'opp-1', discord_message_id: 'msg-1', deadlines: { tba: false, event_start: '2026-01-01T00:00:00Z' } }],
      }),
      update: vi.fn().mockImplementation((id: string, data: any) => {
        pbUpdates.push([id, data]);
        return Promise.resolve();
      }),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createBookmarkHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];

    const reaction = {
      emoji: { id: 'emoji-123' },
      message: {
        id: 'msg-1',
        partial: false,
        reply: vi.fn().mockResolvedValue(undefined),
      },
    };
    const user = { bot: false };

    await handlerFn(reaction, user);

    expect(pbUpdates).toHaveLength(1);
    expect(pbUpdates[0][1].bookmark).toBe(true);
    // Event is in the past → no future reminders
    expect(pbUpdates[0][1].reminders).toEqual([]);
  });

  it('fetches partial message before processing (Pitfall 2)', async () => {
    let fetched = false;
    const pbUpdates: any[] = [];
    const pb = makePbMock({
      getList: vi.fn().mockResolvedValue({
        items: [{ ...fixtureOpp, id: 'opp-1', discord_message_id: 'msg-1' }],
      }),
      update: vi.fn().mockImplementation((id: string, data: any) => {
        pbUpdates.push([id, data]);
        return Promise.resolve();
      }),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createBookmarkHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];

    const reaction = {
      emoji: { id: 'emoji-123' },
      message: {
        id: 'msg-1',
        partial: true,
        fetch: vi.fn().mockImplementation(async () => {
          fetched = true;
        }),
        reply: vi.fn().mockResolvedValue(undefined),
      },
    };
    const user = { bot: false };

    await handlerFn(reaction, user);

    expect(fetched).toBe(true);
    expect(pbUpdates).toHaveLength(1);
  });

  it('skips when opportunity not found by message ID', async () => {
    const pb = makePbMock({
      getList: vi.fn().mockResolvedValue({ items: [] }),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const client = { on: vi.fn() } as any;
    hoisted.mockGetClient.mockReturnValue(client);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    createBookmarkHandler({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
      client,
    });

    const handlerFn = client.on.mock.calls.find((c: any[]) => c[0] === 'messageReactionAdd')?.[1];

    const reaction = {
      emoji: { id: 'emoji-123' },
      message: {
        id: 'msg-1',
        partial: false,
        reply: vi.fn().mockResolvedValue(undefined),
      },
    };
    const user = { bot: false };

    await handlerFn(reaction, user);

    expect(pb.collection('opportunities').update).not.toHaveBeenCalled();
  });

  it('startBookmarkHandler creates a handler with stop', () => {
    hoisted.mockGetClient.mockReturnValue(null);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const handler = startBookmarkHandler({ env: testEnv, log: mockLogger as any });

    expect(handler).toBeUndefined();
  });
});
