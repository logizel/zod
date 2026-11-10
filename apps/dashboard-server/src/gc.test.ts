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
  runPersistentGc,
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

// ---------------------------------------------------------------------------
// runPersistentGc: real PocketBase persistence (deletes/updates/marker)
// ---------------------------------------------------------------------------

type FakeRow = Record<string, unknown>;

function makeFakePb(seed: Record<string, FakeRow[]> = {}): {
  pb: any;
  data: Map<string, Map<string, FakeRow>>;
} {
  const data = new Map<string, Map<string, FakeRow>>();
  let seq = 0;
  for (const [name, rows] of Object.entries(seed)) {
    data.set(name, new Map(rows.map((r) => [String(r.id), { ...r }])));
  }

  const collection = (name: string) => {
    if (!data.has(name)) data.set(name, new Map());
    const rows = data.get(name)!;
    const notFound = () => {
      const err = new Error('404 not found') as Error & { status: number };
      err.status = 404;
      return err;
    };
    return {
      getFullList: async () => [...rows.values()].map((r) => ({ ...r })),
      getFirstListItem: async (filter: string) => {
        const match = filter.match(/^slot = '(.+)'$/);
        const wanted = match?.[1];
        const row = [...rows.values()].find((r) => r['slot'] === wanted);
        if (!row) throw notFound();
        return { ...row };
      },
      create: async (input: FakeRow) => {
        const id = `row-${++seq}`;
        const row = {
          id,
          created: new Date(NOW).toISOString(),
          updated: new Date(NOW).toISOString(),
          ...input,
        };
        rows.set(id, row);
        return { ...row };
      },
      update: async (id: string, patch: FakeRow) => {
        const row = rows.get(id);
        if (!row) throw notFound();
        Object.assign(row, patch, { updated: new Date(NOW).toISOString() });
        return { ...row };
      },
      delete: async (id: string) => rows.delete(id),
    };
  };

  return { pb: { collection } as any, data };
}

function at(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

function persistentSeed(): Record<string, FakeRow[]> {
  return {
    agent_telemetry: [
      { id: 'tel-old', slot: 'auditor-1', created: at(-25 * HOUR_MS), detail: 'old heavy detail' },
      { id: 'tel-fresh', slot: 'auditor-2', created: at(-2 * HOUR_MS), detail: 'fresh detail' },
      {
        id: 'gc-marker',
        slot: 'gc-last-success',
        created: at(-1 * HOUR_MS),
        updated: at(-1 * HOUR_MS),
        detail: at(-1 * HOUR_MS),
        provider: 'system',
        model: 'gc',
        step: 'gc-midnight',
        status: 'done',
      },
    ],
    opportunities: [
      { id: 'opp-old', end_date: at(-25 * HOUR_MS), description_raw: 'old raw', status: 'expired' },
      { id: 'opp-fresh', end_date: at(-2 * HOUR_MS), description_raw: 'fresh raw', status: 'candidate' },
      {
        id: 'opp-rejected-old',
        end_date: at(10 * 24 * HOUR_MS),
        updated: at(-49 * HOUR_MS),
        description_raw: 'rejected heavy text',
        status: 'rejected',
      },
      {
        id: 'opp-rejected-fresh',
        end_date: null,
        updated: at(-47 * HOUR_MS),
        description_raw: 'recent rejection text',
        status: 'rejected',
      },
    ],
    tombstone_ledger: [
      { id: 'tomb-1', url_hash: 'h1', fingerprint: 'f1', terminal_status: 'rejected', decided_at: at(-100 * HOUR_MS) },
    ],
    taste_rules: [
      { id: 'taste-1', kind: 'BLOCK', rule: 'crypto', weight: 1, source: 'keyword' },
    ],
  };
}

describe('runPersistentGc', () => {
  it('deletes 24h-old telemetry and compacts opportunity heavy text in PocketBase', async () => {
    const { pb, data } = makeFakePb(persistentSeed());
    const sendAlert = vi.fn().mockResolvedValue(true);

    const result = await runPersistentGc({
      pb,
      nowMs: NOW,
      sendAlert,
      summaryAlert: false,
      env: { ...requiredEnv } as any,
    });

    expect(result.telemetryDeleted).toBe(1);
    expect(data.get('agent_telemetry')!.has('tel-old')).toBe(false);
    expect(data.get('agent_telemetry')!.has('tel-fresh')).toBe(true);

    // 24h after end_date -> compacted.
    expect(data.get('opportunities')!.get('opp-old')!.description_raw).toBe('');
    expect(data.get('opportunities')!.get('opp-fresh')!.description_raw).toBe('fresh raw');
    // 48h after rejection -> compacted even with a future end_date.
    expect(data.get('opportunities')!.get('opp-rejected-old')!.description_raw).toBe('');
    // 47h after rejection -> still retained.
    expect(data.get('opportunities')!.get('opp-rejected-fresh')!.description_raw).toBe(
      'recent rejection text',
    );
    expect(result.opportunityTextPurged).toBe(2);
    expect(result.errors).toBe(0);
  });

  it('deletes 24h-old machine_events and keeps fresh glass rows', async () => {
    const seed = persistentSeed();
    seed.machine_events = [
      {
        id: 'me-old',
        created: at(-25 * HOUR_MS),
        agent: 'scheduler',
        event_type: 'scheduler',
        tool: 'scheduler.tick',
        status: 'ok',
      },
      {
        id: 'me-fresh',
        created: at(-2 * HOUR_MS),
        agent: 'auditor-events-1',
        event_type: 'llm',
        tool: 'groq.chat',
        status: 'ok',
      },
    ];
    const { pb, data } = makeFakePb(seed);

    const result = await runPersistentGc({
      pb,
      nowMs: NOW,
      sendAlert: vi.fn().mockResolvedValue(true),
      summaryAlert: false,
      env: { ...requiredEnv } as any,
    });

    expect(result.machineEventsDeleted).toBe(1);
    expect(data.get('machine_events')!.has('me-old')).toBe(false);
    expect(data.get('machine_events')!.has('me-fresh')).toBe(true);
  });

  it('never touches tombstone_ledger or taste_rules', async () => {
    const seed = persistentSeed();
    const { pb, data } = makeFakePb(seed);

    await runPersistentGc({
      pb,
      nowMs: NOW,
      sendAlert: vi.fn().mockResolvedValue(true),
      summaryAlert: false,
      env: { ...requiredEnv } as any,
    });

    expect([...data.get('tombstone_ledger')!.keys()]).toEqual(['tomb-1']);
    expect([...data.get('taste_rules')!.keys()]).toEqual(['taste-1']);
  });

  it('persists the last-success marker by updating the existing row', async () => {
    const { pb, data } = makeFakePb(persistentSeed());

    const result = await runPersistentGc({
      pb,
      nowMs: NOW,
      sendAlert: vi.fn().mockResolvedValue(true),
      summaryAlert: false,
      env: { ...requiredEnv } as any,
    });

    const markers = [...data.get('agent_telemetry')!.values()].filter(
      (r) => r['slot'] === 'gc-last-success',
    );
    expect(markers).toHaveLength(1);
    expect(result.persisted).toBe(true);
    expect(result.lastSuccessMs).toBe(NOW);
    expect(Date.parse(String(markers[0].detail))).toBe(NOW);
  });

  it('creates the last-success marker when none exists', async () => {
    const { pb, data } = makeFakePb({
      agent_telemetry: [],
      opportunities: [],
    });

    const result = await runPersistentGc({
      pb,
      nowMs: NOW,
      sendAlert: vi.fn().mockResolvedValue(true),
      summaryAlert: false,
      env: { ...requiredEnv } as any,
    });

    const markers = [...data.get('agent_telemetry')!.values()].filter(
      (r) => r['slot'] === 'gc-last-success',
    );
    expect(markers).toHaveLength(1);
    expect(result.persisted).toBe(true);
  });

  it('raises the 25h-missing alert from the persisted marker across restarts', async () => {
    resetGcState(); // simulate a fresh scheduler process (no module state)
    const seed = persistentSeed();
    const marker = seed.agent_telemetry.find((r) => r['slot'] === 'gc-last-success')!;
    marker.detail = at(-26 * HOUR_MS);
    marker.created = at(-26 * HOUR_MS);
    marker.updated = at(-26 * HOUR_MS);
    const { pb } = makeFakePb(seed);
    const sendAlert = vi.fn().mockResolvedValue(true);

    const result = await runPersistentGc({
      pb,
      nowMs: NOW,
      sendAlert,
      summaryAlert: false,
      env: { ...requiredEnv } as any,
    });

    expect(result.alertRaised).toBe(true);
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(String(sendAlert.mock.calls[0][0])).toContain('25h-missing');
  });

  it('does not persist success and sends a FAILED summary when a delete fails', async () => {
    const seed = persistentSeed();
    const { pb, data } = makeFakePb(seed);
    const originalCollection = pb.collection.bind(pb);
    pb.collection = (name: string) => {
      const coll = originalCollection(name);
      if (name === 'agent_telemetry') {
        coll.delete = async () => {
          throw new Error('PB delete failed');
        };
      }
      return coll;
    };
    const sendAlert = vi.fn().mockResolvedValue(true);

    const result = await runPersistentGc({
      pb,
      nowMs: NOW,
      sendAlert,
      env: { ...requiredEnv } as any,
    });

    expect(result.errors).toBeGreaterThan(0);
    expect(result.persisted).toBe(false);
    const marker = [...data.get('agent_telemetry')!.values()].find(
      (r) => r['slot'] === 'gc-last-success',
    )!;
    expect(Date.parse(String(marker.detail))).toBe(NOW - 1 * HOUR_MS); // unchanged
    expect(String(sendAlert.mock.calls.at(-1)?.[0])).toContain('FAILED');
  });
});
