import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockGetClient: vi.fn(),
  mockResolveChannel: vi.fn(),
  mockCreatePbClient: vi.fn(),
  mockCreateLogger: vi.fn(),
}));

const { mockGetClient, mockResolveChannel, mockCreatePbClient, mockCreateLogger } = hoisted;

vi.mock('./gateway.js', () => ({
  getClient: hoisted.mockGetClient as unknown,
}));

vi.mock('./router-service.js', () => ({
  resolveChannel: hoisted.mockResolveChannel as unknown,
}));

vi.mock('@zod/db-hot', () => ({
  createPbClient: hoisted.mockCreatePbClient as unknown,
}));

vi.mock('@zod/logger', () => ({
  createLogger: hoisted.mockCreateLogger as unknown,
}));

import {
  createRelayService,
  startRelayService,
  RELAY_CURSOR_SLOT,
} from './relay.js';

beforeEach(() => {
  hoisted.mockGetClient.mockReset();
  hoisted.mockResolveChannel.mockReset();
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
    getFirstListItem: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    ...collectionOverrides,
  };
  return { collection: vi.fn(() => collection) };
}

describe('relay service (ING-04, D-04)', () => {
  it('skips when discord client is not ready', async () => {
    hoisted.mockGetClient.mockReturnValue(null);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const svc = createRelayService({
      env: { DISCORD_RELAY_SOURCE_CHANNEL_ID: '123', DISCORD_CHANNEL_RELAY: '456' } as any,
      log: mockLogger as any,
    });

    await svc.tick();
    expect(hoisted.mockGetClient).toHaveBeenCalled();
  });

  it('skips when DISCORD_RELAY_SOURCE_CHANNEL_ID is not set', async () => {
    hoisted.mockGetClient.mockReturnValue({} as any);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const svc = createRelayService({
      env: {} as any,
      log: mockLogger as any,
    });

    await svc.tick();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('relays new messages from source to target channel with cursor persistence', async () => {
    const sourceChannel = {
      isTextBased: () => true,
      messages: {
        fetch: vi.fn().mockResolvedValue(new Map([
          ['msg1', { id: 'msg1', content: 'Hello from announcements' }],
          ['msg2', { id: 'msg2', content: 'Second announcement' }],
        ])),
      },
    };
    const targetChannel = { send: vi.fn().mockResolvedValue(undefined) };

    hoisted.mockGetClient.mockReturnValue({ channels: { fetch: vi.fn().mockResolvedValue(sourceChannel) } } as any);
    hoisted.mockResolveChannel.mockResolvedValue(targetChannel);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const pb = makePbMock({
      getFirstListItem: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const svc = createRelayService({
      env: {
        DISCORD_RELAY_SOURCE_CHANNEL_ID: 'source-123',
        DISCORD_CHANNEL_RELAY: 'relay-456',
      } as any,
      log: mockLogger as any,
      pb: pb as any,
    });

    await svc.tick();

    expect(hoisted.mockResolveChannel).toHaveBeenCalled();
    expect(targetChannel.send).toHaveBeenCalledTimes(2);
    expect(targetChannel.send).toHaveBeenCalledWith({ content: 'Hello from announcements' });
    expect(targetChannel.send).toHaveBeenCalledWith({ content: 'Second announcement' });
    // Cursor persisted with highest message ID
    expect(pb.collection('agent_telemetry').create).toHaveBeenCalledWith(
      expect.objectContaining({ slot: RELAY_CURSOR_SLOT, detail: 'msg2' }),
    );
  });

  it('resumes from existing cursor (skips already-relayed messages)', async () => {
    const sourceChannel = {
      isTextBased: () => true,
      messages: {
        fetch: vi.fn().mockResolvedValue(new Map([
          ['msg3', { id: 'msg3', content: 'New message after cursor' }],
        ])),
      },
    };
    const targetChannel = { send: vi.fn().mockResolvedValue(undefined) };

    hoisted.mockGetClient.mockReturnValue({ channels: { fetch: vi.fn().mockResolvedValue(sourceChannel) } } as any);
    hoisted.mockResolveChannel.mockResolvedValue(targetChannel);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const pb = makePbMock({
      getFirstListItem: vi.fn().mockResolvedValue({ detail: 'msg1' }), // existing cursor
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const svc = createRelayService({
      env: {
        DISCORD_RELAY_SOURCE_CHANNEL_ID: 'source-123',
        DISCORD_CHANNEL_RELAY: 'relay-456',
      } as any,
      log: mockLogger as any,
      pb: pb as any,
    });

    await svc.tick();

    // fetch was called with after: 'msg1'
    const fetchCall = sourceChannel.messages.fetch.mock.calls[0];
    expect(fetchCall[0].after).toBe('msg1');
    expect(targetChannel.send).toHaveBeenCalledTimes(1);
    expect(targetChannel.send).toHaveBeenCalledWith({ content: 'New message after cursor' });
  });

  it('handles per-message errors without aborting the batch', async () => {
    const sourceChannel = {
      isTextBased: () => true,
      messages: {
        fetch: vi.fn().mockResolvedValue(new Map([
          ['msg1', { id: 'msg1', content: 'First message' }],
          ['msg2', { id: 'msg2', content: 'Second message' }],
        ])),
      },
    };
    const targetChannel = {
      send: vi.fn()
        .mockRejectedValueOnce(new Error('send failed'))
        .mockResolvedValueOnce(undefined),
    };

    hoisted.mockGetClient.mockReturnValue({ channels: { fetch: vi.fn().mockResolvedValue(sourceChannel) } } as any);
    hoisted.mockResolveChannel.mockResolvedValue(targetChannel);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const pb = makePbMock({
      getFirstListItem: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const svc = createRelayService({
      env: {
        DISCORD_RELAY_SOURCE_CHANNEL_ID: 'source-123',
        DISCORD_CHANNEL_RELAY: 'relay-456',
      } as any,
      log: mockLogger as any,
      pb: pb as any,
    });

    await svc.tick();

    // Both messages attempted despite first failure
    expect(targetChannel.send).toHaveBeenCalledTimes(2);
    // Cursor updated to last successfully relayed message
    expect(pb.collection('agent_telemetry').create).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'msg2' }),
    );
  });

  it('startRelayService returns a RelayService with tick and stop', () => {
    hoisted.mockGetClient.mockReturnValue({} as any);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const svc = startRelayService({
      env: {} as any,
      log: mockLogger as any,
    });

    expect(typeof svc.tick).toBe('function');
    expect(typeof svc.stop).toBe('function');
  });
});
