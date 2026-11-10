// Sources: adapter health derived from scheduler machine events.
import { describe, expect, it } from 'vitest';
import { buildSources, handleSources, sourceNameFromEvent } from './sources.js';
import { toMachineEventDto } from './machine.js';

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);

function at(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

function schedulerEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `evt-${Math.random()}`,
    created: at(5),
    trace_id: 'job-portal-ctftime',
    agent: 'scheduler',
    event_type: 'scheduler',
    tool: 'scheduler.tick',
    status: 'ok',
    duration_ms: 430,
    meta: { job: 'portal-ctftime', candidates: 3 },
    ...overrides,
  };
}

describe('sourceNameFromEvent', () => {
  it('prefers meta.job, then the job- trace prefix, then the agent', () => {
    expect(
      sourceNameFromEvent(toMachineEventDto(schedulerEvent({ meta: { job: 'portal-clist' } }))),
    ).toBe('portal-clist');
    expect(
      sourceNameFromEvent(
        toMachineEventDto(schedulerEvent({ meta: {}, trace_id: 'job-jobs-poll' })),
      ),
    ).toBe('jobs-poll');
    expect(
      sourceNameFromEvent(
        toMachineEventDto(schedulerEvent({ meta: {}, trace_id: '', agent: 'scheduler' })),
      ),
    ).toBe('scheduler');
  });
});

describe('buildSources', () => {
  it('always lists known adapters, even before the first poll', () => {
    const body = buildSources({ nowMs: NOW, eventRows: [] });
    const names = body.sources.map((s) => s.name);
    expect(names).toContain('portal-ctftime');
    expect(names).toContain('portal-clist');
    expect(names).toContain('jobs-poll');
    expect(names).toContain('loot-watchlist');
    expect(body.sources.find((s) => s.name === 'portal-ctftime')).toMatchObject({
      label: 'CTFtime',
      kind: 'portal',
      lastStatus: null,
      runsToday: 0,
    });
  });

  it('records the latest poll, candidates, duration, and error', () => {
    const body = buildSources({
      nowMs: NOW,
      eventRows: [
        schedulerEvent({ created: at(10), status: 'ok', meta: { job: 'portal-ctftime', candidates: 2 } }),
        schedulerEvent({ created: at(4), status: 'error', detail: 'HTTP 503', meta: { job: 'portal-ctftime' } }),
        schedulerEvent({
          created: at(2),
          status: 'ok',
          duration_ms: 900,
          trace_id: 'job-portal-clist',
          meta: { job: 'portal-clist', candidates: 7 },
        }),
      ],
    });

    const ctftime = body.sources.find((s) => s.name === 'portal-ctftime')!;
    expect(ctftime.lastStatus).toBe('error');
    expect(ctftime.lastAt).toBe(at(4));
    expect(ctftime.error).toBe('HTTP 503');
    expect(ctftime.runsToday).toBe(1);
    expect(ctftime.failuresToday).toBe(1);

    const clist = body.sources.find((s) => s.name === 'portal-clist')!;
    expect(clist.lastStatus).toBe('ok');
    expect(clist.durationMs).toBe(900);
    expect(clist.candidates).toBe(7);
    expect(clist.error).toBe('');
  });

  it('adds previously unknown adapters and sorts them after known sources', () => {
    const body = buildSources({
      nowMs: NOW,
      eventRows: [
        schedulerEvent({ meta: { job: 'portal-new' }, trace_id: '', agent: 'scheduler' }),
      ],
    });
    const unknown = body.sources.find((s) => s.name === 'portal-new')!;
    expect(unknown.kind).toBe('other');
    expect(body.sources[body.sources.length - 1].name).toBe('portal-new');
  });

  it('ignores non-scheduler events', () => {
    const body = buildSources({
      nowMs: NOW,
      eventRows: [
        schedulerEvent({ event_type: 'llm', status: 'error', meta: { job: 'portal-ctftime' } }),
      ],
    });
    expect(body.sources.find((s) => s.name === 'portal-ctftime')!.lastStatus).toBeNull();
  });
});

describe('handleSources', () => {
  it('returns 200 with source cards', async () => {
    const state = { status: 0, body: '' };
    const res = {
      writeHead(status: number) {
        state.status = status;
      },
      end(body?: string) {
        state.body = body ?? '';
      },
    };
    await handleSources(res, {
      pb: {
        collection: () => ({
          getList: async () => ({ items: [schedulerEvent()] }),
        }),
      },
      nowMs: NOW,
    });
    expect(state.status).toBe(200);
    expect(JSON.parse(state.body).sources.length).toBeGreaterThan(0);
  });

  it('returns 503 when PocketBase fails', async () => {
    const state = { status: 0, body: '' };
    const res = {
      writeHead(status: number) {
        state.status = status;
      },
      end(body?: string) {
        state.body = body ?? '';
      },
    };
    await handleSources(res, {
      pb: {
        collection: () => ({
          getList: async () => {
            throw new Error('down');
          },
        }),
      },
    });
    expect(state.status).toBe(503);
  });
});
