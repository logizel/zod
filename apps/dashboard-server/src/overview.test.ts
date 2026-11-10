// Overview kanban: stage mapping, dedupe, and live stats.
import { describe, expect, it } from 'vitest';
import { buildOverview, handleOverview, OVERVIEW_STAGES } from './overview.js';

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);

function at(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

function scratchpad(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sp-1',
    candidate_url: 'https://example.com/event/1',
    candidate_title: 'National CTF',
    pipeline: 'events',
    step_position: 'STEP_1-scout',
    updated: at(5),
    ...overrides,
  };
}

function opportunity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'op-1',
    title: 'National CTF',
    pipeline: 'events',
    status: 'audited',
    links: { official: 'https://example.com/event/1' },
    bucket_channel: '#online-1lakh-plus',
    prize_cash_inr: 150000,
    updated: at(3),
    ...overrides,
  };
}

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `evt-${Math.random()}`,
    created: at(1),
    trace_id: 'trace-1',
    agent: 'auditor-events-1',
    pipeline: 'events',
    event_type: 'llm',
    tool: 'groq.chat',
    provider: 'groq',
    model: 'llama-3.3-70b',
    step: 'STEP_3-audit',
    status: 'ok',
    url: 'https://example.com/event/1',
    ...overrides,
  };
}

describe('buildOverview stages', () => {
  it('maps scratchpad step positions to queued / auditing / routing / delivered', () => {
    const body = buildOverview({
      nowMs: NOW,
      eventRows: [],
      scratchpadRows: [
        scratchpad({ id: 'q', candidate_url: 'https://example.com/q', step_position: 'STEP_1-scout' }),
        scratchpad({ id: 'a', candidate_url: 'https://example.com/a', step_position: 'STEP_2-audit' }),
        scratchpad({ id: 'r', candidate_url: 'https://example.com/r', step_position: 'STEP_3-audit' }),
        scratchpad({ id: 'd', candidate_url: 'https://example.com/d', step_position: 'STEP_4-route' }),
      ],
      opportunityRows: [],
    });

    expect(body.counts).toEqual({
      queued: 1,
      fetching: 0,
      auditing: 1,
      routing: 1,
      delivered: 1,
    });
    expect(body.stages.queued[0].id).toBe('q');
    expect(body.stages.auditing[0].id).toBe('a');
  });

  it('moves a queued scratchpad card to fetching when its latest fetch is a start', () => {
    const body = buildOverview({
      nowMs: NOW,
      scratchpadRows: [scratchpad()],
      opportunityRows: [],
      eventRows: [
        event({
          event_type: 'fetch',
          tool: 'jina.reader',
          status: 'start',
          created: at(1),
          trace_id: '',
        }),
      ],
    });

    expect(body.counts.fetching).toBe(1);
    expect(body.stages.fetching[0]).toMatchObject({
      url: 'https://example.com/event/1',
      tool: 'jina.reader',
      provider: 'groq',
    });
  });

  it('maps audited opportunities to routing and routed opportunities to delivered', () => {
    const body = buildOverview({
      nowMs: NOW,
      scratchpadRows: [],
      eventRows: [],
      opportunityRows: [
        opportunity({ id: 'aud', status: 'audited', links: { official: 'https://example.com/aud' } }),
        opportunity({ id: 'routed', status: 'routed', links: { official: 'https://example.com/routed' } }),
        opportunity({ id: 'rejected', status: 'rejected', links: { official: 'https://example.com/no' } }),
      ],
    });

    expect(body.stages.routing.map((c) => c.id)).toEqual(['aud']);
    expect(body.stages.delivered.map((c) => c.id)).toEqual(['routed']);
    expect(body.stages.routing[0].channel).toBe('#online-1lakh-plus');
    expect(body.stages.routing[0].prize_cash_inr).toBe(150000);
  });

  it('deduplicates by URL, keeping the furthest stage', () => {
    const body = buildOverview({
      nowMs: NOW,
      scratchpadRows: [scratchpad()],
      opportunityRows: [opportunity({ status: 'routed', updated: at(2) })],
      eventRows: [],
    });

    expect(body.counts.delivered).toBe(1);
    expect(body.counts.queued).toBe(0);
    expect(body.counts.routing).toBe(0);
    expect(body.stages.delivered[0].title).toBe('National CTF');
  });

  it('counts active agents, errors, baton passes, and routed-today', () => {
    const body = buildOverview({
      nowMs: NOW,
      scratchpadRows: [],
      opportunityRows: [opportunity({ status: 'routed', updated: at(60) })],
      eventRows: [
        event({ id: 'e1', status: 'ok', agent: 'auditor-events-1', created: at(2) }),
        event({ id: 'e2', status: 'error', agent: 'scout-events-1', created: at(3) }),
        event({ id: 'e3', status: 'ok', agent: 'router-events-1', baton_to: 'cerebras:qwen', created: at(4) }),
        event({ id: 'e4', status: 'ok', agent: 'old-agent', created: at(30) }),
      ],
    });

    expect(body.stats.activeAgents).toBe(2);
    expect(body.stats.recentCalls).toBe(4);
    expect(body.stats.errors).toBe(1);
    expect(body.stats.batonPasses).toBe(1);
    expect(body.stats.deliveredToday).toBe(1);
  });

  it('always returns all five stages even when empty', () => {
    const body = buildOverview({ nowMs: NOW, scratchpadRows: [], opportunityRows: [], eventRows: [] });
    expect(Object.keys(body.stages)).toEqual([...OVERVIEW_STAGES]);
  });
});

describe('handleOverview', () => {
  it('returns 200 with a joined snapshot', async () => {
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
        getFullList: async () =>
          name === 'task_scratchpad' ? [scratchpad()] : [opportunity()],
        getList: async () => ({ items: [event()] }),
      }),
    };

    await handleOverview(res, { pb, nowMs: NOW });
    expect(state.status).toBe(200);
    const body = JSON.parse(state.body);
    expect(body.counts.routing).toBe(1);
    expect(body.stats.recentCalls).toBe(1);
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
    await handleOverview(res, {
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
