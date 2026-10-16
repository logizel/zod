import { describe, expect, it } from 'vitest';
import { runPollTick } from './jobs.js';

function makePb() {
  const rows = new Map<string, any>();
  let counter = 0;
  const tombstones: any[] = [];
  const coll = (name: string) => ({
    getFirstListItem: async (filter: string) => {
      const m = /candidate_url = '(.+)'/u.exec(filter);
      const url = m ? m[1].replace(/''/g, "'") : '';
      for (const r of rows.values()) {
        if (r.candidate_url === url) return r;
      }
      const err: any = new Error('not found');
      err.status = 404;
      throw err;
    },
    create: async (data: any) => {
      const row = { id: `r${++counter}`, created: new Date().toISOString(), updated: new Date().toISOString(), ...data };
      rows.set(row.id, row);
      return row;
    },
    update: async (id: string, data: any) => {
      const row = rows.get(id);
      if (!row) {
        const err: any = new Error('not found');
        err.status = 404;
        throw err;
      }
      Object.assign(row, data, { updated: new Date().toISOString() });
      return row;
    },
    getOne: async (id: string) => rows.get(id),
  });
  const pb: any = {
    collection: (name: string) => {
      if (name === 'tombstone_ledger') {
        return { create: async (data: any) => { tombstones.push(data); return data; } };
      }
      return coll(name);
    },
  };
  (pb as any).__rows = rows;
  (pb as any).__tombstones = tombstones;
  return pb as any;
}

function makeLogger() {
  const records: any[] = [];
  const build = (b: Record<string, unknown>): any => ({
    info: (...a: any[]) => records.push({ level: 'info', bindings: b, args: a }),
    warn: (...a: any[]) => records.push({ level: 'warn', bindings: b, args: a }),
    child: (e: Record<string, unknown>) => build({ ...b, ...e }),
  });
  return { log: build({}), records };
}

describe('scheduler poll wiring (tracer order)', () => {
  it('passes a valid candidate through prefilter → scratchpad → fetch → STEP_2', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: '# capped markdown payload', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const def = {
      name: 'events-stub',
      expression: '*/20 * * * *',
      maxRandomDelayMs: 0,
      description: 'stub',
    } as any;
    const candidates = [{ url: 'https://example.com/event', title: 'Valid Hackathon 2026', snippet: 'cash prize' }];

    await runPollTick(def, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    expect(fetchCalls).toHaveLength(1);
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].step_position).toBe('STEP_2');
    expect(rows[0].partial_buffer).toContain('capped markdown');
  });

  it('scout-rejects expired candidates without fetching', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: 'x', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const def = { name: 'events-stub', expression: '*/20 * * * *', maxRandomDelayMs: 0, description: 'stub' } as any;
    const candidates = [{ url: 'https://example.com/old', title: 'Crypto giveaway airdrop', snippet: 'free tokens' }];

    await runPollTick(def, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    expect(fetchCalls).toHaveLength(0);
    const tombstones = (pb as any).__tombstones;
    expect(tombstones.length).toBeGreaterThanOrEqual(1);
    expect(tombstones[0].terminal_status).toBe('scout_rejected');
  });
});

// ---------------------------------------------------------------------------
// Candidate source injection (Phase 5)
// ---------------------------------------------------------------------------

describe('candidate source injection', () => {
  it('injected fake source list() drives candidates for events source', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: '# payload', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();

    const fakeSource = {
      pipeline: 'events',
      list: async () => [
        { url: 'https://example.com/event-1', title: 'Event 1', snippet: 'cash prize' },
      ],
    };

    const def = {
      name: 'portal-ctftime',
      expression: '*/15 * * * *',
      maxRandomDelayMs: 0,
      candidateSource: 'events',
      description: 'portal',
    } as any;

    await runPollTick(def, logger.log as any, {
      pb, hot, cold, fetch: fetchFn, candidateSources: { events: fakeSource },
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe('https://example.com/event-1');
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].step_position).toBe('STEP_2');
  });

  it('injected fake source list() drives candidates for jobs source', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: '# payload', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();

    const fakeSource = {
      pipeline: 'jobs',
      list: async () => [
        { url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Frontend Engineer (Fresher)', snippet: '0-1 years experience' },
      ],
    };

    const def = {
      name: 'jobs-poll',
      expression: '*/40 * * * *',
      maxRandomDelayMs: 0,
      candidateSource: 'jobs',
      description: 'jobs',
    } as any;

    await runPollTick(def, logger.log as any, {
      pb, hot, cold, fetch: fetchFn, candidateSources: { jobs: fakeSource },
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe('https://boards.greenhouse.io/acme/jobs/1');
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].step_position).toBe('STEP_2');
  });

  it('declared candidate source missing logs warning and skips (never static list)', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const logger = makeLogger();

    const def = {
      name: 'portal-ctftime',
      expression: '*/15 * * * *',
      maxRandomDelayMs: 0,
      candidateSource: 'nonexistent-source',
      description: 'portal',
    } as any;

    await runPollTick(def, logger.log as any, {
      pb, hot, cold, candidateSources: {},
    });

    // No scratchpad rows, no tombstones — static list never used
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(0);
    const tombstones = (pb as any).__tombstones;
    expect(tombstones).toHaveLength(0);

    // Warning logged for missing source (args[1] is the message string)
    const warns = logger.records.filter((r: any) => r.level === 'warn');
    expect(warns.some((w: any) => w.args[1] === 'declared candidate source missing; skipping candidate processing')).toBe(true);
  });

  it('with live deps injected and no source, POLL_CANDIDATES never processed (zero writes)', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const logger = makeLogger();

    const def = {
      name: 'events-stub',
      expression: '*/20 * * * *',
      maxRandomDelayMs: 0,
      description: 'stub',
    } as any;

    await runPollTick(def, logger.log as any, { pb, hot, cold });

    // No sample URLs processed — zero scratchpad/tombstone writes
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(0);
    const tombstones = (pb as any).__tombstones;
    expect(tombstones).toHaveLength(0);

    // 'no candidate source; skipping' warning logged
    const warns = logger.records.filter((r: any) => r.level === 'warn');
    expect(warns.some((w: any) => w.args[1] === 'no candidate source; skipping')).toBe(true);
  });

  it('explicit candidates override still honored in tests', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: '# payload', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();

    const def = {
      name: 'events-stub',
      expression: '*/20 * * * *',
      maxRandomDelayMs: 0,
      description: 'stub',
    } as any;
    const candidates = [{ url: 'https://example.com/explicit', title: 'Explicit', snippet: 'test' }];

    await runPollTick(def, logger.log as any, {
      pb, hot, cold, fetch: fetchFn, candidates,
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe('https://example.com/explicit');
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(1);
  });

  it('ats-json detail override used when present — facade not called', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: '# facade fallback', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();

    const detailCalls: string[] = [];
    const fakeSource: import('./jobs.js').CandidateSource = {
      pipeline: 'jobs',
      fetch: 'ats-json' as const,
      list: async () => [
        { url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Job 1', snippet: 'hiring' },
      ],
      detail: async (cand: any) => {
        detailCalls.push(cand.url);
        return 'ATS JSON detail text for ' + cand.url;
      },
    };

    const def = {
      name: 'jobs-poll',
      expression: '*/40 * * * *',
      maxRandomDelayMs: 0,
      candidateSource: 'jobs',
      description: 'jobs',
    } as any;

    await runPollTick(def, logger.log as any, {
      pb, hot, cold, fetch: fetchFn, candidateSources: { jobs: fakeSource },
    });

    // Detail fetch called, facade NOT called
    expect(detailCalls).toHaveLength(1);
    expect(detailCalls[0]).toBe('https://boards.greenhouse.io/acme/jobs/1');
    expect(fetchCalls).toHaveLength(0);
    const rows = [...(pb as any).__rows.values()];
    expect(rows[0].partial_buffer).toContain('ATS JSON detail text');
  });

  it('facade fallback when ats-json detail returns null', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: '# facade markdown', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();

    const fakeSource: import('./jobs.js').CandidateSource = {
      pipeline: 'jobs',
      fetch: 'ats-json' as const,
      list: async () => [
        { url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Job 1', snippet: 'hiring' },
      ],
      detail: async () => null, // detail returns null → facade fallback
    };

    const def = {
      name: 'jobs-poll',
      expression: '*/40 * * * *',
      maxRandomDelayMs: 0,
      candidateSource: 'jobs',
      description: 'jobs',
    } as any;

    await runPollTick(def, logger.log as any, {
      pb, hot, cold, fetch: fetchFn, candidateSources: { jobs: fakeSource },
    });

    // Detail called, facade used as fallback
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe('https://boards.greenhouse.io/acme/jobs/1');
    const rows = [...(pb as any).__rows.values()];
    expect(rows[0].partial_buffer).toContain('facade markdown');
  });

  it('pipeline + candidate_title reach the scratchpad writer', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchFn = async () => ({ markdown: '# content', capped: true, source: 'jina' as const });
    const logger = makeLogger();

    const fakeSource = {
      pipeline: 'jobs',
      list: async () => [
        { url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Frontend Engineer (Fresher)', snippet: '0-1 yrs' },
      ],
    };

    const def = {
      name: 'jobs-poll',
      expression: '*/40 * * * *',
      maxRandomDelayMs: 0,
      candidateSource: 'jobs',
      description: 'jobs',
    } as any;

    await runPollTick(def, logger.log as any, {
      pb, hot, cold, fetch: fetchFn, candidateSources: { jobs: fakeSource },
    });

    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].step_position).toBe('STEP_2');
    expect(rows[0].candidate_title).toBe('Frontend Engineer (Fresher)');
    expect(rows[0].pipeline).toBe('jobs');
    expect(rows[0].candidate_url).toBe('https://boards.greenhouse.io/acme/jobs/1');
  });
});
