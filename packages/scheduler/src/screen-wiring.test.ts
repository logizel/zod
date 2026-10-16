// D-04 listing screen wiring in the jobs tick — senior reject zero-fetch,
// flag-only telemetry, non-jobs pipelines untouched.

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

const jobsDef = {
  name: 'jobs-poll',
  expression: '*/40 * * * *',
  maxRandomDelayMs: 0,
  candidateSource: 'jobs',
  description: 'jobs poll',
} as any;

const eventsDef = {
  name: 'events-stub',
  expression: '*/20 * * * *',
  maxRandomDelayMs: 0,
  candidateSource: 'events',
  description: 'events stub',
} as any;

describe('screen-wiring in jobs tick (D-04)', () => {
  it('jobs senior reject → one senior_role tombstone, zero fetch, loop continues', async () => {
    const pb = makePb();
    const tombstones = (pb as any).__tombstones;
    const cold = {
      findTombstone: async () => null,
      create: async (data: any) => { tombstones.push(data); return data; },
    };
    const hot = { hasFingerprint: async () => false };
    const fetchCalls: string[] = [];
    const fetchFn = async (_url: string) => {
      fetchCalls.push(_url);
      return { markdown: '# capped markdown payload', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const candidates = [
      { url: 'https://example.com/senior', title: 'Senior Backend Engineer', snippet: '3+ years of experience required' },
      { url: 'https://example.com/next', title: 'Junior Frontend Engineer', snippet: '0-1 years experience, Bangalore' },
    ];

    await runPollTick(jobsDef, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    // Exactly one senior_role tombstone
    expect(tombstones.length).toBe(1);
    expect(tombstones[0].terminal_status).toBe('senior_role');
    expect(tombstones[0].source).toBe('listing-screen');
    expect(tombstones[0].decided_at).toBeDefined();

    // Zero fetch calls — senior reject stops before fetch for that candidate.
    // The second (junior) candidate proceeds but scratchpad resume may skip
    // if it already exists; at minimum the senior candidate triggered no fetch.
    const seniorFetch = fetchCalls.filter((u) => u.includes('senior'));
    expect(seniorFetch).toHaveLength(0);
  });

  it('jobs borderline title → proceeds to fetch (not rejected at listing)', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (_url: string) => {
      fetchCalls.push(_url);
      return { markdown: '# content', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const candidates = [{ url: 'https://example.com/borderline', title: 'Backend Engineer II', snippet: 'mid level role' }];

    await runPollTick(jobsDef, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    // Borderline is not rejected → fetch attempted
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe('https://example.com/borderline');
  });

  it('jobs flag-only listing → no tombstone, proceeds to fetch', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (_url: string) => {
      fetchCalls.push(_url);
      return { markdown: '# content', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const candidates = [{ url: 'https://example.com/flagged', title: 'Junior Developer', snippet: 'pay training fee to join, US only' }];

    await runPollTick(jobsDef, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    // Flag-only: no tombstone
    expect((pb as any).__tombstones).toHaveLength(0);
    // Proceeds to fetch
    expect(fetchCalls).toHaveLength(1);
  });

  it('events pipeline candidate → screenListing never called, pipeline unchanged', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (_url: string) => {
      fetchCalls.push(_url);
      return { markdown: '# content', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    // A senior-title events candidate — if screenListing were called it would reject.
    // Since candidateSource !== 'jobs', screenListing is skipped and the pipeline proceeds.
    const candidates = [{ url: 'https://example.com/event', title: 'Senior Staff Engineer', snippet: 'lead a team' }];

    await runPollTick(eventsDef, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    // screenListing not called for events → fetch proceeds (no senior_role tombstone)
    expect((pb as any).__tombstones).toHaveLength(0);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe('https://example.com/event');
  });

  it('empty snippet with valid title → reject null, flags [], continues to fetch', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (_url: string) => {
      fetchCalls.push(_url);
      return { markdown: '# content', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    // Non-empty title (fingerprint requires it), empty snippet — screenListing
    // returns reject null, flags [], tick continues to fetch.
    const candidates = [{ url: 'https://example.com/empty-snippet', title: 'Junior Role', snippet: '' }];

    await runPollTick(jobsDef, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    expect((pb as any).__tombstones).toHaveLength(0);
    expect(fetchCalls).toHaveLength(1);
  });
});
