// sendOpsAlert tests (RED — implementation lands in GREEN).
//
// Behavior under test (D-15, Pitfall 14):
// - sendOpsAlert resolves #🛠-ops-health via env-ID-first (DISCORD_CHANNEL_OPS_HEALTH)
// - Name fallback when env ID is not set or fetch fails
// - No channel found -> returns false, does not throw
// - Discord client not ready -> returns false
// - No secrets leaked into logs or alert text
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { sendOpsAlert, type AlertDeps } from './alerts.js';

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
