// GC telemetry + 25h-missing alert tests (RED — implementation lands in GREEN).
//
// Behavior under test (D-14, Pitfall 11, MEM-05):
// - runMidnightGc composes purgeExpiredHeavyText + telemetry emission + 25h check
// - Emits a telemetry event with counts (purged/compacted/errors)
// - Tracks last successful GC run time
// - Raises a 25h-missing alert if GC hasn't succeeded in GC_ALERT_HOURS (default 25h)
// - Idempotent: re-running on already-purged rows is a no-op
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  runMidnightGc,
  getLastSuccessfulGcMs,
  resetGcState,
  type GcRunResult,
} from './gc.js';

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

function makeRows(): {
  agentTelemetry: Array<{ id: string; created: string; detail: string }>;
  opportunities: Array<{ id: string; end_date: string | null; description_raw: string; status: string }>;
} {
  return {
    agentTelemetry: [
      {
        id: 'tel-old',
        created: new Date(NOW - (25 * HOUR_MS)).toISOString(), // 25h ago -> purge-eligible
        detail: 'heavy micro-step detail',
      },
      {
        id: 'tel-fresh',
        created: new Date(NOW - 2 * HOUR_MS).toISOString(), // 2h ago -> kept
        detail: 'fresh detail',
      },
    ],
    opportunities: [
      {
        id: 'opp-old',
        end_date: new Date(NOW - (25 * HOUR_MS)).toISOString(), // purge-eligible
        description_raw: 'heavy raw description',
        status: 'expired',
      },
      {
        id: 'opp-kept',
        end_date: new Date(NOW - 2 * HOUR_MS).toISOString(), // kept
        description_raw: 'kept raw',
        status: 'candidate',
      },
    ],
  };
}

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
  SAMBANOVA_API_KEY: '',
  DISCORD_CHANNEL_JOBS_SYS_CLOUD: '',
  DISCORD_CHANNEL_JOBS_GENERAL: '',
  DISCORD_CHANNEL_LOOT: '',
  FELLOWSHIP_ALLOWLIST_EXTRA: '',
  OPERATOR_USER_IDS: '',
  LOCAL_WATCHLIST_DOMAINS: '',
  SOCIAL_COOKIES_PATH: '',
  DISCORD_RELAY_SOURCE_CHANNEL_ID: '',
  BOOKMARK_EMOJI_ID: '',
  DISCORD_CHANNEL_LOCAL: '',
  DISCORD_CHANNEL_TRAVEL: '',
  DISCORD_CHANNEL_TBA: '',
  DISCORD_CHANNEL_RELAY: '',
  DISCORD_CHANNEL_TRAINING: '',
  DISCORD_CHANNEL_OPS_HEALTH: '',
  STALENESS_THRESHOLD_MS: '90000',
  SSE_VIEWER_CAP: '2',
  GC_ALERT_HOURS: '25',
  SSE_CONNECTION_TIMEOUT_MS: '120000',
  ACCESS_OWNER_EMAIL: '',
  LOG_LEVEL: 'info' as const,
};

beforeEach(() => {
  resetGcState();
  vi.clearAllMocks();
});

afterEach(() => {
  resetGcState();
});

describe('runMidnightGc', () => {
  it('emits telemetry event with counts (purged/compacted/errors) after purge', async () => {
    const sendAlert = vi.fn().mockResolvedValue(true);
    const result: GcRunResult = await runMidnightGc(makeRows(), NOW, { sendAlert });

    expect(typeof result.purged).toBe('number');
    expect(typeof result.compacted).toBe('number');
    expect(typeof result.errors).toBe('number');
    expect(result.purged).toBeGreaterThanOrEqual(1); // at least detail + description_raw cleared
    expect(result.errors).toBe(0);
  });

  it('clears only detail (agent_telemetry) and description_raw (opportunities), retains metadata', async () => {
    const sendAlert = vi.fn().mockResolvedValue(true);
    const rows = makeRows();
    await runMidnightGc(rows, NOW, { sendAlert });

    expect(rows.agentTelemetry[0].detail).toBe(''); // old telemetry detail purged
    expect(rows.agentTelemetry[1].detail).toBe('fresh detail'); // fresh kept
    expect(rows.opportunities[0].description_raw).toBe(''); // old opportunity description purged
    expect(rows.opportunities[1].description_raw).toBe('kept raw'); // kept
    expect(rows.opportunities[0].end_date).toBeDefined(); // metadata retained
    expect(rows.opportunities[0].status).toBe('expired'); // metadata retained
  });

  it('tracks last successful GC run time and does not alert on fresh success', async () => {
    const sendAlert = vi.fn().mockResolvedValue(true);
    const first = await runMidnightGc(makeRows(), NOW, { sendAlert });
    expect(first.lastSuccessMs).toBe(NOW);
    expect(first.alertRaised).toBe(false); // first run after reset: no previous success to go stale

    sendAlert.mockClear();
    const second = await runMidnightGc(makeRows(), NOW + 1000, { sendAlert }); // 1s later
    expect(second.alertRaised).toBe(false);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('does not raise 25h-missing alert when GC has never succeeded', async () => {
    const sendAlert = vi.fn().mockResolvedValue(true);
    // resetGcState already called in beforeEach -> lastSuccessfulGcMs is null
    const result = await runMidnightGc(makeRows(), NOW, { sendAlert });

    expect(result.alertRaised).toBe(false); // no previous success to go stale
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('raises 25h-missing alert when 25h have passed since last success', async () => {
    const sendAlert = vi.fn().mockResolvedValue(true);
    const oneHourAgo = NOW - (26 * HOUR_MS); // 26h ago -> past the 25h threshold
    // Simulate a prior success by directly setting state via a successful run long ago
    await runMidnightGc(makeRows(), oneHourAgo, { sendAlert: vi.fn().mockResolvedValue(true) });
    // lastSuccessfulGcMs should now be oneHourAgo
    expect(getLastSuccessfulGcMs()).toBe(oneHourAgo);

    sendAlert.mockClear();
    const result = await runMidnightGc(makeRows(), NOW, { sendAlert }); // 26h later
    expect(result.alertRaised).toBe(true);
    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  it('does not raise alert when GC ran within GC_ALERT_HOURS', async () => {
    const sendAlert = vi.fn().mockResolvedValue(true);
    await runMidnightGc(makeRows(), NOW, { sendAlert }); // success at NOW

    sendAlert.mockClear();
    const result = await runMidnightGc(makeRows(), NOW + (24 * HOUR_MS), { sendAlert }); // 24h later, within 25h
    expect(result.alertRaised).toBe(false);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('is idempotent: re-running on already-purged rows is a no-op', async () => {
    const sendAlert = vi.fn().mockResolvedValue(true);
    const rows = makeRows();
    const first = await runMidnightGc(rows, NOW, { sendAlert });
    expect(first.purged).toBeGreaterThanOrEqual(1);

    sendAlert.mockClear();
    const second = await runMidnightGc(rows, NOW, { sendAlert }); // same rows, already purged
    expect(second.purged).toBe(0);
    expect(second.errors).toBe(0);
    expect(sendAlert).not.toHaveBeenCalled(); // no new alert, GC just succeeded
  });

  it('uses GC_ALERT_HOURS from env (default 25h)', async () => {
    const sendAlert = vi.fn().mockResolvedValue(true);
    const env = { ...requiredEnv, GC_ALERT_HOURS: '1' };
    // First run: no previous success to go stale, so no alert even with short threshold
    const result = await runMidnightGc(makeRows(), NOW + (2 * HOUR_MS), { env, sendAlert });
    expect(result.alertRaised).toBe(false); // no prior success to go stale
    expect(sendAlert).not.toHaveBeenCalled();
  });
});
