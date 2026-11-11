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

type RowsByTool = Record<string, Array<Record<string, unknown>>>;

function makePb(
  options: {
    rowsByTool?: RowsByTool;
    socialFetch?: Record<string, unknown>;
    fail?: boolean;
  } = {},
) {
  const filters: string[] = [];
  return {
    filters,
    pb: {
      collection: () => ({
        getList: async (_page: number, _perPage: number, opts?: unknown) => {
          if (options.fail) throw new Error('down');
          const filter = String((opts as { filter?: string } | undefined)?.filter ?? '');
          filters.push(filter);
          const toolMatch = /tool = "job\.([^"]+)"/.exec(filter);
          if (toolMatch && options.rowsByTool?.[toolMatch[1]!]) {
            return { items: options.rowsByTool[toolMatch[1]!] };
          }
          if (filter.includes('fetch.social')) {
            return { items: options.socialFetch ? [options.socialFetch] : [] };
          }
          return { items: [] };
        },
      }),
    },
  };
}

function capture() {
  const state = { status: 0, body: '' };
  const res = {
    writeHead(status: number) {
      state.status = status;
    },
    end(body?: string) {
      state.body = body ?? '';
    },
  };
  return { state, res };
}

describe('sourceNameFromEvent', () => {
  it('prefers meta.job, then the tool, then the trace prefix, then the agent', () => {
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

  it('derives the job name from runStubTick tool/trace forms', () => {
    expect(
      sourceNameFromEvent(
        toMachineEventDto(
          schedulerEvent({
            meta: {},
            tool: 'job.portal-ctftime',
            trace_id: 'job:portal-ctftime',
            agent: 'scheduler:portal-ctftime',
          }),
        ),
      ),
    ).toBe('portal-ctftime');
    expect(
      sourceNameFromEvent(
        toMachineEventDto(
          schedulerEvent({
            meta: {},
            tool: 'job.audit-drain',
            trace_id: '',
            agent: 'scheduler:audit-drain',
          }),
        ),
      ),
    ).toBe('audit-drain');
    expect(
      sourceNameFromEvent(
        toMachineEventDto(
          schedulerEvent({
            meta: {},
            tool: 'scheduler.tick',
            trace_id: '',
            agent: 'scheduler:portal-meetup',
          }),
        ),
      ),
    ).toBe('portal-meetup');
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
      lastTarget: '',
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

  it('fills known cards from runStubTick job.<name> events (no scheduler: duplicates)', () => {
    const body = buildSources({
      nowMs: NOW,
      eventRows: [
        schedulerEvent({
          created: at(6),
          status: 'start',
          meta: {},
          tool: 'job.portal-ctftime',
          trace_id: 'job:portal-ctftime',
          agent: 'scheduler:portal-ctftime',
        }),
        schedulerEvent({
          created: at(5),
          status: 'ok',
          meta: { candidates: 4, durationMs: 900 },
          tool: 'job.portal-ctftime',
          trace_id: 'job:portal-ctftime',
          agent: 'scheduler:portal-ctftime',
        }),
      ],
    });

    const ctftime = body.sources.find((s) => s.name === 'portal-ctftime')!;
    expect(ctftime.lastStatus).toBe('ok');
    expect(ctftime.candidates).toBe(4);
    expect(ctftime.runsToday).toBe(1);
    expect(body.sources.some((s) => s.name === 'scheduler:portal-ctftime')).toBe(false);
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
  it('queries each known source by its own job tool (24h+ lookback)', async () => {
    const { pb, filters } = makePb({});
    const { state, res } = capture();
    await handleSources(res, { pb, nowMs: NOW });

    expect(state.status).toBe(200);
    // 7 portals + jobs + loot + local + social = 11 per-source queries.
    for (const name of [
      'portal-ctftime',
      'portal-clist',
      'portal-unstop',
      'portal-devfolio',
      'portal-devpost',
      'portal-luma',
      'portal-meetup',
      'jobs-poll',
      'loot-watchlist',
      'local-stub',
      'social-stub',
    ]) {
      expect(filters.some((filter) => filter.includes(`tool = "job.${name}"`))).toBe(true);
    }
  });

  it('hydrates the social card with its latest fetch target', async () => {
    const socialRun = schedulerEvent({
      created: at(22 * 60),
      trace_id: 'job-social-stub',
      meta: { job: 'social-stub', candidates: 3 },
    });
    const { pb } = makePb({
      rowsByTool: { 'social-stub': [socialRun] },
      socialFetch: {
        created: at(22 * 60 - 1),
        event_type: 'fetch',
        tool: 'fetch.social',
        url: 'https://x.com/search?q=hackathon+india&src=typed_query&f=live',
      },
    });
    const { state, res } = capture();
    await handleSources(res, { pb, nowMs: NOW });

    const body = JSON.parse(state.body);
    const social = body.sources.find((s: { name: string }) => s.name === 'social-stub');
    expect(social.lastStatus).toBe('ok');
    expect(social.lastTarget).toBe(
      'https://x.com/search?q=hackathon+india&src=typed_query&f=live',
    );
  });

  it('surfaces a skipped social fetch (expired session) in the card error column', async () => {
    const { pb } = makePb({
      socialFetch: {
        created: at(30),
        event_type: 'fetch',
        tool: 'fetch.social',
        status: 'skip',
        url: 'https://www.linkedin.com/feed/',
        output_summary:
          '0 post(s) — LinkedIn session rejected (re-export burner cookies)',
      },
    });
    const { state, res } = capture();
    await handleSources(res, { pb, nowMs: NOW });

    const body = JSON.parse(state.body);
    const social = body.sources.find((s: { name: string }) => s.name === 'social-stub');
    expect(social.lastTarget).toBe('https://www.linkedin.com/feed/');
    expect(social.error).toContain('session rejected');
  });

  it('keeps discovered jobs from the recent scheduler window', async () => {
    const { pb } = makePb({
      rowsByTool: {},
    });
    const { state, res } = capture();
    await handleSources(res, { pb, nowMs: NOW });
    const body = JSON.parse(state.body);
    expect(body.sources.length).toBeGreaterThanOrEqual(11);
    expect(state.status).toBe(200);
  });

  it('returns 503 when PocketBase fails', async () => {
    const { pb } = makePb({ fail: true });
    const { state, res } = capture();
    await handleSources(res, { pb, nowMs: NOW });
    expect(state.status).toBe(503);
  });
});
