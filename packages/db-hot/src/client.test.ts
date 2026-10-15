// Client-construction tests (D-13): auth-store wiring proven with a mocked
// fetch layer — no live PocketBase server required for unit green.
// Plus the five-collection schema contract assertions (D-09/D-15).
import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import {
  createPbClient,
  ensureEventSource,
  loadTokenInitial,
  type FetchLike,
} from './client.js';
import {
  AgentTelemetry,
  HOT_COLLECTIONS,
  INDEX_NOTES,
  Opportunity,
  OpportunityRow,
  TaskScratchpad,
  TasteRule,
  TombstoneMirror,
} from './schema.js';

const TEST_ENV = {
  PB_URL: 'http://127.0.0.1:8090',
  PB_SERVICE_EMAIL: 'svc@example.com',
  PB_SERVICE_PASSWORD: 'svc-password',
};

const AUTH_TOKEN = 'mocked-service-token';
const AUTH_RECORD = {
  id: 'svc-record-id',
  email: TEST_ENV.PB_SERVICE_EMAIL,
  collectionName: '_superusers',
};

interface CapturedRequest {
  url: string;
  init?: Record<string, unknown>;
}

function mockFetch(captured: CapturedRequest[]): FetchLike {
  return async (url: string, init?: Record<string, unknown>) => {
    captured.push({ url, init });
    return {
      status: 200,
      url,
      json: async () => ({ token: AUTH_TOKEN, record: AUTH_RECORD }),
    };
  };
}

describe('ensureEventSource', () => {
  it('leaves a realtime-capable global EventSource defined', () => {
    ensureEventSource();
    expect(globalThis.EventSource).toBeDefined();
    expect(typeof globalThis.EventSource).toBe('function');
  });
});

describe('createPbClient (mocked transport)', () => {
  it('authenticates the shared service account and persists the token store', async () => {
    const captured: CapturedRequest[] = [];
    const tokenFile = join(tmpdir(), `pb-auth-test-${Date.now()}.json`);

    const pb = await createPbClient(TEST_ENV, {
      tokenFile,
      fetchImpl: mockFetch(captured),
    });

    // One auth call against the superusers collection, identity + password.
    expect(captured).toHaveLength(1);
    expect(captured[0]?.url).toBe(
      'http://127.0.0.1:8090/api/collections/_superusers/auth-with-password',
    );
    const body = JSON.parse(String(captured[0]?.init?.['body']));
    expect(body).toMatchObject({
      identity: TEST_ENV.PB_SERVICE_EMAIL,
      password: TEST_ENV.PB_SERVICE_PASSWORD,
    });

    // Auth store holds the service token + record (proves store wiring).
    expect(pb.authStore.token).toBe(AUTH_TOKEN);
    const record = pb.authStore.record as { email?: unknown } | null;
    expect(record?.email).toBe(TEST_ENV.PB_SERVICE_EMAIL);

    // AsyncAuthStore persisted through save(): token file written 0600.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const persisted = readFileSync(tokenFile, 'utf8');
    expect(persisted).toContain(AUTH_TOKEN);
    expect(loadTokenInitial(tokenFile)).toBe(persisted);
    expect(statSync(tokenFile).mode & 0o777).toBe(0o600);
  });

  it('loads a previous boot token as initial store state', () => {
    expect(loadTokenInitial(join(tmpdir(), 'pb-auth-test-missing.json'))).toBeUndefined();
  });
});

describe('collection schemas (five-collection lock)', () => {
  const OPPORTUNITY_FIXTURE = {
    fingerprint_hash: 'abc123',
    url_hash: 'def456',
    pipeline: 'events',
    bucket_channel: '#-online-1lakh-plus',
    status: 'candidate',
    title: 'Example Hackathon',
    organizer: 'Example Org',
    links: { official: 'https://example.com/event' },
    prize_cash_inr: 150000,
    prize_text: 'INR 1.5L cash',
    deadlines: { tba: false, apply_by: '2026-11-01T00:00:00.000Z' },
    end_date: '2026-11-10T00:00:00.000Z',
    reminders: [],
    bookmark: false,
    audit_summary: 'verified liquid cash',
    description_raw: '<heavy text, first GC purge target>',
  };

  it('exports validators for all five locked collections', () => {
    expect(HOT_COLLECTIONS).toEqual([
      'opportunities',
      'agent_telemetry',
      'task_scratchpad',
      'tombstone_ledger',
      'taste_rules',
    ]);
    expect(Opportunity.parse(OPPORTUNITY_FIXTURE).fingerprint_hash).toBe('abc123');
    expect(
      AgentTelemetry.parse({
        slot: 'scout-events-1',
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        step: 'STEP_1-filter',
        url: 'https://example.com',
        status: 'active',
      }).slot,
    ).toBe('scout-events-1');
    expect(
      TaskScratchpad.parse({
        candidate_url: 'https://example.com/event',
        step_position: 'STEP_2',
      }).step_position,
    ).toBe('STEP_2');
    expect(
      TombstoneMirror.parse({
        url_hash: 'def456',
        fingerprint: 'abc123',
        terminal_status: 'routed',
        decided_at: '2026-10-15T00:00:00.000Z',
      }).url_hash,
    ).toBe('def456');
    expect(TasteRule.parse({ kind: 'boost', rule: 'sys-cp-sec' }).weight).toBe(1.0);
  });

  it('carries the GC-ready fields on opportunities', () => {
    const parsed = Opportunity.parse(OPPORTUNITY_FIXTURE);
    expect(parsed.end_date).toBe('2026-11-10T00:00:00.000Z');
    expect(parsed.status).toBe('candidate');
    expect(parsed.description_raw).not.toBe('');
  });

  it('fails LOUD on schema drift (missing/wrong-typed known fields)', () => {
    expect(() =>
      Opportunity.parse({ ...OPPORTUNITY_FIXTURE, fingerprint_hash: undefined }),
    ).toThrow();
    expect(() =>
      Opportunity.parse({ ...OPPORTUNITY_FIXTURE, prize_cash_inr: 'a lot' }),
    ).toThrow();
  });

  it('preserves unknown PocketBase system fields on rows (no silent drop)', () => {
    const row = OpportunityRow.parse({
      ...OPPORTUNITY_FIXTURE,
      id: 'rec1',
      created: '2026-10-15T00:00:00.000Z',
      updated: '2026-10-15T00:00:00.000Z',
      expand: { relations: [] },
    });
    expect(row['expand']).toEqual({ relations: [] });
  });

  it('documents an index set for every locked collection', () => {
    for (const collection of HOT_COLLECTIONS) {
      expect(INDEX_NOTES[collection].length).toBeGreaterThan(0);
    }
    expect(INDEX_NOTES['opportunities'].join(' ')).toContain('fingerprint_hash');
  });
});
