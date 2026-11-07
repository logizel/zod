// sendOpsAlert tests (RED — implementation lands in GREEN).
//
// Behavior under test (D-15, Pitfall 14):
// - sendOpsAlert resolves #🛠-ops-health via env-ID-first (DISCORD_CHANNEL_OPS_HEALTH)
// - Name fallback when env ID is not set or fetch fails
// - No channel found -> returns false, does not throw
// - Discord client not ready -> returns false
// - No secrets leaked into logs or alert text
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createOpsAlertSender, sendOpsAlert, type AlertDeps } from './alerts.js';

const requiredEnv = {
  PB_URL: 'http://127.0.0.1:8090',
  PB_SERVICE_EMAIL: 'owner@example.com',
  PB_SERVICE_PASSWORD: 's3cret',
  JINA_API_KEY: 'jina-test',
  TURSO_DATABASE_URL: 'libsql://test.turso.io',
  TURSO_AUTH_TOKEN: 't0ken',
  GROQ_API_KEY: 'groq-test',
  GITHUB_TOKEN: 'github-test',
  DISCORD_TOKEN: 'discord-test',
  DISCORD_CHANNEL_OPS_HEALTH: '111000000000000000',
};

function makeDeps(overrides: Partial<AlertDeps> = {}): AlertDeps {
  const log = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  };
  const client = {
    channels: { fetch: vi.fn() },
    guilds: { cache: { values: vi.fn(() => []) } },
  };
  return {
    env: { ...requiredEnv } as any,
    client,
    log,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendOpsAlert', () => {
  it('resolves #🛠-ops-health via env-ID-first and sends the alert', async () => {
    const deps = makeDeps();
    const mockChannel = { send: vi.fn().mockResolvedValue({}), isTextBased: () => true, isDMBased: () => false };
    deps.client.channels.fetch.mockResolvedValue(mockChannel);

    const ok = await sendOpsAlert('GC summary: purged=3 compacted=5 errors=0', deps);

    expect(ok).toBe(true);
    expect(deps.client.channels.fetch).toHaveBeenCalledWith('111000000000000000');
    expect(mockChannel.send).toHaveBeenCalledWith({ content: 'GC summary: purged=3 compacted=5 errors=0' });
    expect(deps.log.info).toHaveBeenCalledWith(
      { channel: '#🛠-ops-health' },
      'ops alert sent',
    );
  });

  it('falls back to name-based resolution when env ID fetch fails', async () => {
    const deps = makeDeps();
    deps.client.channels.fetch.mockRejectedValue(new Error('not found'));
    // Same object reference used by both resolveOpsHealthChannel and the assertion
    const opsHealthChannel = {
      name: '🛠-ops-health',
      isTextBased: () => true,
      isDMBased: () => false,
      send: vi.fn().mockResolvedValue({}),
    };
    const mockGuild = {
      channels: {
        cache: {
          values: () => [opsHealthChannel, { name: 'other-channel', isTextBased: () => true, isDMBased: () => false }],
        },
      },
    };
    deps.client.guilds.cache.values.mockReturnValue([mockGuild]);

    const ok = await sendOpsAlert('tunnel down alert', deps);

    expect(ok).toBe(true);
    expect(opsHealthChannel.send).toHaveBeenCalledWith({ content: 'tunnel down alert' });
  });

  it('returns false and does not throw when no channel is resolvable', async () => {
    const deps = makeDeps();
    deps.client.channels.fetch.mockRejectedValue(new Error('not found'));
    deps.client.guilds.cache.values.mockReturnValue([]);

    const ok = await sendOpsAlert('orphaned alert', deps);

    expect(ok).toBe(false);
    expect(deps.log.warn).toHaveBeenCalledWith(
      { channel: '#🛠-ops-health' },
      'ops-health channel not found; alert not sent',
    );
  });

  it('returns false when discord client is not ready', async () => {
    const deps = makeDeps({ client: null as any });

    const ok = await sendOpsAlert('no-client alert', deps);

    expect(ok).toBe(false);
    expect(deps.log.warn).toHaveBeenCalledWith(
      { channel: '#🛠-ops-health' },
      'discord client not ready; ops alert skipped',
    );
  });

  it('does not leak secrets into alert text or logs', async () => {
    const deps = makeDeps();
    const mockChannel = { send: vi.fn().mockResolvedValue({}), isTextBased: () => true, isDMBased: () => false };
    deps.client.channels.fetch.mockResolvedValue(mockChannel);

    // Alert text contains a token-shaped string — should still be sent as-is
    // (the caller is responsible for sanitizing; sendOpsAlert itself does not log the text)
    await sendOpsAlert('alert with token=abc123secret', deps);

    expect(mockChannel.send).toHaveBeenCalledWith({ content: 'alert with token=abc123secret' });
    // log.info should not contain the raw token
    const infoCalls = (deps.log.info as any).mock.calls.map((args: any[]) => JSON.stringify(args));
    expect(infoCalls.some((s: string) => s.includes('abc123secret'))).toBe(false);
    expect(deps.log.error).not.toHaveBeenCalled();
  });

  it('handles Discord send failure gracefully', async () => {
    const deps = makeDeps();
    const mockChannel = { send: vi.fn().mockRejectedValue(new Error('rate limited')), isTextBased: () => true, isDMBased: () => false };
    deps.client.channels.fetch.mockResolvedValue(mockChannel);

    const ok = await sendOpsAlert('rate-limited alert', deps);

    expect(ok).toBe(false);
    expect(deps.log.error).toHaveBeenCalledWith(
      { error: 'rate limited' },
      'failed to send ops alert',
    );
  });
});

describe('createOpsAlertSender (REST, headless scheduler)', () => {
  function makeRestDeps(overrides: Record<string, unknown> = {}) {
    const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    return {
      env: { ...requiredEnv } as any,
      log,
      fetchImpl: vi.fn(),
      apiBase: 'https://discord.test/api/v10',
      ...overrides,
    } as any;
  }

  it('posts to the env-provided ops-health channel ID', async () => {
    const deps = makeRestDeps();
    deps.fetchImpl.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const ok = await createOpsAlertSender(deps)('GC summary');

    expect(ok).toBe(true);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = deps.fetchImpl.mock.calls[0];
    expect(url).toBe('https://discord.test/api/v10/channels/111000000000000000/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bot discord-test');
    expect(JSON.parse(init.body)).toEqual({ content: 'GC summary' });
  });

  it('resolves the channel by guild name when no env ID is set', async () => {
    const deps = makeRestDeps({
      env: { ...requiredEnv, DISCORD_CHANNEL_OPS_HEALTH: '' } as any,
    });
    deps.fetchImpl
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 'guild-1' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          { id: 'other', name: 'general', type: 0 },
          { id: 'ops-1', name: '🛠-ops-health', type: 0 },
        ],
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const ok = await createOpsAlertSender(deps)('resolved by name');

    expect(ok).toBe(true);
    expect(deps.fetchImpl.mock.calls[2][0]).toBe(
      'https://discord.test/api/v10/channels/ops-1/messages',
    );
  });

  it('caches the name-resolved channel across alerts', async () => {
    const deps = makeRestDeps({
      env: { ...requiredEnv, DISCORD_CHANNEL_OPS_HEALTH: '' } as any,
    });
    deps.fetchImpl.mockImplementation(async (url: string) => {
      if (url.endsWith('/users/@me/guilds')) {
        return { ok: true, status: 200, json: async () => [{ id: 'guild-1' }] };
      }
      if (url.endsWith('/guilds/guild-1/channels')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'ops-1', name: 'ops-health', type: 0 }],
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const send = createOpsAlertSender(deps);
    await send('one');
    await send('two');

    const channelLookups = deps.fetchImpl.mock.calls.filter(([url]: [string]) =>
      url.endsWith('/users/@me/guilds'),
    );
    expect(channelLookups).toHaveLength(1);
    expect(
      deps.fetchImpl.mock.calls.filter(([url]: [string]) => url.endsWith('/messages')),
    ).toHaveLength(2);
  });

  it('returns false when Discord rejects the message', async () => {
    const deps = makeRestDeps();
    deps.fetchImpl.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    const ok = await createOpsAlertSender(deps)('failed alert');

    expect(ok).toBe(false);
    expect(deps.log.warn).toHaveBeenCalled();
  });

  it('returns false without calling Discord when the token is missing', async () => {
    const deps = makeRestDeps({ env: { ...requiredEnv, DISCORD_TOKEN: '' } as any });

    const ok = await createOpsAlertSender(deps)('no token');

    expect(ok).toBe(false);
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
});
