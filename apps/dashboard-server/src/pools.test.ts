// Pool health: provider × model state, cooldowns, and today's call counts.
import { describe, expect, it } from 'vitest';
import { buildPools, handlePools } from './pools.js';

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);

function at(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

function telemetry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `tel-${Math.random()}`,
    provider: 'groq',
    model: 'llama-3.3-70b',
    step: 'STEP_1-scout',
    status: 'active',
    detail: '',
    duration_ms: 120,
    updated: at(1),
    ...overrides,
  };
}

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `evt-${Math.random()}`,
    created: at(2),
    agent: 'auditor-events-1',
    event_type: 'llm',
    tool: 'groq.chat',
    provider: 'groq',
    model: 'llama-3.3-70b',
    status: 'ok',
    duration_ms: 800,
    ...overrides,
  };
}

describe('buildPools', () => {
  it('takes the newest telemetry row per provider × model bucket', () => {
    const body = buildPools({
      nowMs: NOW,
      eventRows: [],
      telemetryRows: [
        telemetry({ status: 'cooldown', detail: '429 cooldown' }),
        telemetry({ status: 'active', updated: at(9) }),
      ],
    });

    expect(body.pools).toHaveLength(1);
    expect(body.pools[0]).toMatchObject({
      provider: 'groq',
      model: 'llama-3.3-70b',
      state: '60s-COOLDOWN',
    });
    expect(body.pools[0].cooldownUntil).toBe(at(0));
  });

  it('derives state from daily-cap telemetry detail', () => {
    const body = buildPools({
      nowMs: NOW,
      eventRows: [],
      telemetryRows: [telemetry({ status: 'done', detail: 'daily cap reached' })],
    });
    expect(body.pools[0].state).toBe('DAILY-CAP');
  });

  it('aggregates today’s LLM attempts, errors, cooldowns, and last call', () => {
    const body = buildPools({
      nowMs: NOW,
      telemetryRows: [telemetry({ provider: 'cerebras', model: 'qwen-3-32b', updated: at(20) })],
      eventRows: [
        event({ id: 'a', created: at(10), status: 'start', duration_ms: null }),
        event({ id: 'b', created: at(8), status: 'ok', duration_ms: 700 }),
        event({ id: 'c', created: at(5), status: 'error', duration_ms: 90 }),
        event({
          id: 'd',
          created: at(4),
          status: 'cooldown',
          duration_ms: null,
          baton_to: 'cerebras:qwen-3-32b',
        }),
        event({ id: 'e', created: at(3), status: 'ok', provider: 'cerebras', model: 'qwen-3-32b' }),
        // Yesterday: ignored in today's counters.
        event({ id: 'f', created: new Date(NOW - 26 * 60 * 60_000).toISOString(), status: 'ok' }),
      ],
    });

    const groq = body.pools.find((p) => p.provider === 'groq')!;
    expect(groq.callsToday).toBe(3); // start excluded, ok + error + cooldown counted
    expect(groq.errorsToday).toBe(1);
    expect(groq.cooldownsToday).toBe(1);
    expect(groq.state).toBe('60s-COOLDOWN');
    expect(groq.lastCallAt).toBe(at(4));
    expect(groq.lastTool).toBe('groq.chat');
    expect(groq.lastDurationMs).toBeNull();

    const cerebras = body.pools.find((p) => p.provider === 'cerebras')!;
    expect(cerebras.callsToday).toBe(1);
    expect(cerebras.lastCallAt).toBe(at(3));
  });

  it('marks a bucket ACTIVE while its latest event is a start', () => {
    const body = buildPools({
      nowMs: NOW,
      telemetryRows: [],
      eventRows: [event({ status: 'start', duration_ms: null })],
    });
    expect(body.pools[0].state).toBe('ACTIVE');
  });

  it('lists all buckets sorted by provider then model', () => {
    const body = buildPools({
      nowMs: NOW,
      eventRows: [],
      telemetryRows: [
        telemetry({ provider: 'groq', model: 'z-model' }),
        telemetry({ provider: 'cerebras', model: 'a-model' }),
        telemetry({ provider: 'groq', model: 'a-model' }),
      ],
    });
    expect(body.pools.map((p) => `${p.provider}:${p.model}`)).toEqual([
      'cerebras:a-model',
      'groq:a-model',
      'groq:z-model',
    ]);
  });
});

describe('handlePools', () => {
  it('returns 200 with pools', async () => {
    const state = { status: 0, body: '' };
    const res = {
      writeHead(status: number) {
        state.status = status;
      },
      end(body?: string) {
        state.body = body ?? '';
      },
    };
    const pb = {
      collection: (name: string) => ({
        getFullList: async () => (name === 'agent_telemetry' ? [telemetry()] : []),
        getList: async () => ({ items: [event()] }),
      }),
    };
    await handlePools(res, { pb, nowMs: NOW });
    expect(state.status).toBe(200);
    expect(JSON.parse(state.body).pools[0].provider).toBe('groq');
  });

  it('returns 503 when the hot store fails', async () => {
    const state = { status: 0, body: '' };
    const res = {
      writeHead(status: number) {
        state.status = status;
      },
      end(body?: string) {
        state.body = body ?? '';
      },
    };
    await handlePools(res, {
      pb: {
        collection: () => ({
          getFullList: async () => {
            throw new Error('down');
          },
        }),
      },
    });
    expect(state.status).toBe(503);
  });
});
