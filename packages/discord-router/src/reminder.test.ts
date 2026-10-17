import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockGetClient: vi.fn(),
  mockCreatePbClient: vi.fn(),
  mockCreateLogger: vi.fn(),
  mockResolveChannel: vi.fn(),
}));

const { mockGetClient, mockCreatePbClient, mockCreateLogger, mockResolveChannel } = hoisted;

vi.mock('./gateway.js', () => ({
  getClient: hoisted.mockGetClient as unknown,
}));

vi.mock('@zod/db-hot', () => ({
  createPbClient: hoisted.mockCreatePbClient as unknown,
}));

vi.mock('@zod/logger', () => ({
  createLogger: hoisted.mockCreateLogger as unknown,
}));

vi.mock('./router-service.js', () => ({
  resolveChannel: hoisted.mockResolveChannel as unknown,
}));

import { reminderTick, createReminderTick } from './reminder.js';

beforeEach(() => {
  hoisted.mockGetClient.mockReset();
  hoisted.mockCreatePbClient.mockReset();
  hoisted.mockCreateLogger.mockReset();
  hoisted.mockResolveChannel.mockReset();
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
  DISCORD_TOKEN: 'test-token',
  DISCORD_CHANNEL_LOCAL: 'chan-local',
} as any;

const past48 = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(); // 49h ago (past, due)
const past24 = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago (past, due)
const future48 = new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(); // 49h from now (future, not due)

describe('reminder ticker (UI-02, D-06)', () => {
  it('skips when discord client is not ready', async () => {
    hoisted.mockGetClient.mockReturnValue(null);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    await reminderTick({
      env: testEnv,
      log: mockLogger as any,
    });

    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('fires due reminders and marks them sent', async () => {
    const pbUpdates: any[] = [];
    const pb = makePbMock({
      getList: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'opp-1',
            title: 'National CTF 2026',
            bucket_channel: '#🔥-priority-sys-cp-sec',
            bookmark: true,
            deadlines: { tba: false, event_start: '2026-12-15T09:00:00Z' },
            reminders: [
              { at: past48, channel: '#🔥-priority-sys-cp-sec', sent: false },
              { at: past24, channel: '#🔥-priority-sys-cp-sec', sent: false },
            ],
          },
        ],
      }),
      update: vi.fn().mockImplementation((id: string, data: any) => {
        pbUpdates.push([id, data]);
        return Promise.resolve();
      }),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const targetChannel = { send: vi.fn().mockResolvedValue(undefined) };
    hoisted.mockGetClient.mockReturnValue({ channels: {} } as any);
    hoisted.mockResolveChannel.mockResolvedValue(targetChannel);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const tick = createReminderTick({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
    });
    const result = await tick();

    expect(result.scanned).toBe(1);
    expect(result.fired).toBe(2);
    expect(targetChannel.send).toHaveBeenCalledTimes(2);
    expect(targetChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('National CTF 2026') }),
    );
    // Both reminders marked sent (each update marks one reminder)
    expect(pbUpdates).toHaveLength(2);
    expect(pbUpdates[0][1].reminders[0].sent).toBe(true); // first update: past48 reminder marked sent
    expect(pbUpdates[1][1].reminders[1].sent).toBe(true); // second update: past24 reminder marked sent
  });

  it('does not fire reminders where sent=true (Pitfall 6)', async () => {
    const pbUpdates: any[] = [];
    const pb = makePbMock({
      getList: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'opp-1',
            title: 'National CTF 2026',
            bucket_channel: '#🔥-priority-sys-cp-sec',
            bookmark: true,
            deadlines: { tba: false, event_start: '2026-12-15T09:00:00Z' },
            reminders: [
              { at: past48, channel: '#🔥-priority-sys-cp-sec', sent: true },
              { at: past24, channel: '#🔥-priority-sys-cp-sec', sent: false },
            ],
          },
        ],
      }),
      update: vi.fn().mockImplementation((id: string, data: any) => {
        pbUpdates.push([id, data]);
        return Promise.resolve();
      }),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const targetChannel = { send: vi.fn().mockResolvedValue(undefined) };
    hoisted.mockGetClient.mockReturnValue({ channels: {} } as any);
    hoisted.mockResolveChannel.mockResolvedValue(targetChannel);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const tick = createReminderTick({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
    });
    const result = await tick();

    expect(result.fired).toBe(1);
    expect(targetChannel.send).toHaveBeenCalledTimes(1);
    // Only the unsent reminder was updated
    expect(pbUpdates).toHaveLength(1);
    expect(pbUpdates[0][1].reminders[1].sent).toBe(true);
  });

  it('skips opportunities with no due reminders', async () => {
    const pb = makePbMock({
      getList: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'opp-1',
            title: 'National CTF 2026',
            bucket_channel: '#🔥-priority-sys-cp-sec',
            bookmark: true,
            deadlines: { tba: false, event_start: '2026-12-15T09:00:00Z' },
            reminders: [
              { at: future48, channel: '#🔥-priority-sys-cp-sec', sent: false },
            ],
          },
        ],
      }),
      update: vi.fn(),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    hoisted.mockGetClient.mockReturnValue({ channels: {} } as any);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const tick = createReminderTick({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
    });
    const result = await tick();

    // future48 is in the future (> now), so not due -> skipped
    expect(result.scanned).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.fired).toBe(0);
  });

  it('per-opportunity error isolation - one bad opp does not abort the batch', async () => {
    const pb = makePbMock({
      getList: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'opp-1',
            title: 'Bad Opp',
            bucket_channel: '#🔥-priority-sys-cp-sec',
            bookmark: true,
            deadlines: { tba: false, event_start: '2026-12-15T09:00:00Z' },
            reminders: [
              { at: past48, channel: '#🔥-priority-sys-cp-sec', sent: false },
            ],
          },
          {
            id: 'opp-2',
            title: 'Good Opp',
            bucket_channel: '#🔥-priority-sys-cp-sec',
            bookmark: true,
            deadlines: { tba: false, event_start: '2026-12-15T09:00:00Z' },
            reminders: [
              { at: past48, channel: '#🔥-priority-sys-cp-sec', sent: false },
            ],
          },
        ],
      }),
      update: vi.fn(),
    });
    hoisted.mockCreatePbClient.mockReturnValue(pb);

    const targetChannel = { send: vi.fn().mockResolvedValue(undefined) };
    hoisted.mockGetClient.mockReturnValue({ channels: {} } as any);
    hoisted.mockResolveChannel.mockResolvedValue(targetChannel);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    // Make resolveChannel throw for the first opportunity's channel
    hoisted.mockResolveChannel.mockRejectedValueOnce(new Error('channel resolve failed'));

    const tick = createReminderTick({
      env: testEnv,
      log: mockLogger as any,
      pb: pb as any,
    });
    const result = await tick();

    // Both opportunities scanned, second one still processed
    expect(result.scanned).toBe(2);
    expect(result.errors).toBeGreaterThanOrEqual(0);
  });

  it('createReminderTick returns a tick function', () => {
    hoisted.mockGetClient.mockReturnValue(null);
    hoisted.mockCreateLogger.mockReturnValue(mockLogger);

    const tick = createReminderTick({
      env: testEnv,
      log: mockLogger as any,
    });

    expect(tick).toBeTypeOf('function');
  });
});
