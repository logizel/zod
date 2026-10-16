import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runPollTick } from './jobs.js';

vi.mock('@zod/dedup/merger', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    createMergeStore: vi.fn(() => ({
      findCandidates: vi.fn(),
      appendLinks: vi.fn(),
      tombstoneMerged: vi.fn(),
    })),
  };
});

import { createMergeStore } from '@zod/dedup/merger';

const mockedCreateMergeStore = createMergeStore as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeLogger() {
  const records: any[] = [];
  const build = (b: Record<string, unknown>): any => ({
    info: (...a: any[]) => records.push({ level: 'info', bindings: b, args: a }),
    warn: (...a: any[]) => records.push({ level: 'warn', bindings: b, args: a }),
    child: (e: Record<string, unknown>) => build({ ...b, ...e }),
  });
  return { log: build({}), records };
}

function makePb() {
  const rows = new Map<string, any>();
  let counter = 0;
  const scratchpad = {
    getFirstListItem: async (_filter: string) => {
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
      if (row) Object.assign(row, data, { updated: new Date().toISOString() });
    },
  };
  const pb: any = {
    collection: (name: string) => {
      if (name === 'task_scratchpad') return scratchpad;
      if (name === 'opportunities') return {
        getList: async () => ({ items: [], totalItems: 0 }),
        update: async () => {},
      };
      if (name === 'tombstone_ledger') return { create: async () => {} };
      return {};
    },
  };
  pb.__rows = rows;
  return pb;
}

function makeCold() {
  return { findTombstone: async () => null, create: async () => {} };
}

function makeDef(overrides: Partial<{ name: string; candidateSource: string }> = {}) {
  return {
    name: 'jobs-poll',
    expression: '*/40 * * * *',
    maxRandomDelayMs: 0,
    candidateSource: 'jobs',
    description: 'jobs',
    ...overrides,
  } as any;
}

const NOW = 1_792_145_094_000;
const baseCandidate = {
  url: 'https://boards.greenhouse.io/acme/jobs/1',
  title: 'Frontend Engineer (Fresher)',
  snippet: '0-1 years experience',
  pipeline: 'jobs' as const,
};

const masterCandidate = {
  id: 'master-1',
  pipeline: 'jobs',
  title: 'Google | I/O 2026',
  url: 'https://boards.greenhouse.io/acme/jobs/1',
  organizer: 'Google',
  location: 'Bangalore, India',
  dateMs: NOW - 86400000,
  createdAtMs: NOW - 86400000,
  links: ['https://boards.greenhouse.io/acme/jobs/1'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scheduler intake merge stage (D-10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedCreateMergeStore.mockReset();
  });

  it('merged → zero fetch calls, zero scratchpad writes, store appendLinks + tombstoneMerged called', async () => {
    // Pre-configure the store factory that createMergeStore will use
    mockedCreateMergeStore.mockImplementation(() => ({
      findCandidates: vi.fn().mockResolvedValue([masterCandidate]),
      appendLinks: vi.fn(),
      tombstoneMerged: vi.fn(),
    }));

    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = makeCold();
    const fetchCalls: string[] = [];
    const fetchFn = async () => {
      fetchCalls.push('x');
      return { markdown: 'x', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const def = makeDef();
    const candidates = [{
      url: 'https://boards.greenhouse.io/acme/jobs/2',
      title: 'Google | I/O 2026',
      snippet: 'hiring',
      pipeline: 'jobs' as const,
      location: 'Bangalore, India',
      dateMs: NOW,
    }];

    await runPollTick(def, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    // createMergeStore called once
    expect(mockedCreateMergeStore).toHaveBeenCalledTimes(1);
    const store = mockedCreateMergeStore.mock.results[0].value;
    expect(store.findCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ pipeline: 'jobs', limit: 50 }),
    );
    // Real attemptMerge called store.appendLinks + tombstoneMerged internally
    expect(store.appendLinks).toHaveBeenCalledWith('master-1', expect.arrayContaining(['https://boards.greenhouse.io/acme/jobs/2']));
    expect(store.tombstoneMerged).toHaveBeenCalledTimes(1);
    const tmCall = store.tombstoneMerged.mock.calls[0];
    expect(tmCall[1]).toBe('merged');
    expect(tmCall[2]).toBe('merger');

    // Zero fetch — merged candidates skip fetch
    expect(fetchCalls).toHaveLength(0);

    // No scratchpad rows — no advanceToStep2
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(0);
  });

  it('non-dupe → full pipeline runs (fetch + scratchpad)', async () => {
    mockedCreateMergeStore.mockImplementation(() => ({
      findCandidates: vi.fn().mockResolvedValue([
        { ...masterCandidate, title: 'Apple WWDC 2026' }, // completely different → no merge
      ]),
      appendLinks: vi.fn(),
      tombstoneMerged: vi.fn(),
    }));

    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = makeCold();
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: '# job description', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const def = makeDef();
    const candidates = [{ ...baseCandidate }];

    await runPollTick(def, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    expect(mockedCreateMergeStore).toHaveBeenCalledTimes(1);
    const store = mockedCreateMergeStore.mock.results[0].value;
    expect(store.appendLinks).not.toHaveBeenCalled();
    expect(store.tombstoneMerged).not.toHaveBeenCalled();

    // Fetch happens
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe('https://boards.greenhouse.io/acme/jobs/1');

    // Scratchpad row created and advanced to STEP_2
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].step_position).toBe('STEP_2');
  });

  it('possibleDupe → pipeline proceeds with log path, fetch still happens', async () => {
    // Master with ≥0.7 but <0.9 title similarity → possibleDupe, not merge
    mockedCreateMergeStore.mockImplementation(() => ({
      findCandidates: vi.fn().mockResolvedValue([
        { ...masterCandidate, title: 'Google IO 2026' }, // normalized similarity ≈ 0.82
      ]),
      appendLinks: vi.fn(),
      tombstoneMerged: vi.fn(),
    }));

    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = makeCold();
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: '# job description', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const def = makeDef();
    const candidates = [{
      url: 'https://boards.greenhouse.io/acme/jobs/3',
      title: 'Google | I/O 2026',
      snippet: 'hiring',
      pipeline: 'jobs' as const,
      location: 'Bangalore, India',
      dateMs: NOW,
    }];

    await runPollTick(def, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    expect(mockedCreateMergeStore).toHaveBeenCalledTimes(1);
    const store = mockedCreateMergeStore.mock.results[0].value;
    expect(store.appendLinks).not.toHaveBeenCalled();
    expect(store.tombstoneMerged).not.toHaveBeenCalled();

    // Pipeline proceeds → fetch happens
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe('https://boards.greenhouse.io/acme/jobs/3');

    // Scratchpad row created and advanced to STEP_2
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].step_position).toBe('STEP_2');
  });

  it('hot-hit precheck → attemptMerge never called (Pitfall 9)', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => true }; // hot hit
    const cold = makeCold();
    const fetchCalls: string[] = [];
    const fetchFn = async () => {
      fetchCalls.push('x');
      return { markdown: 'x', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const def = makeDef();
    const candidates = [{ ...baseCandidate }];

    await runPollTick(def, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    // createMergeStore not called (attemptMerge not reached)
    expect(mockedCreateMergeStore).not.toHaveBeenCalled();

    // Skipped by precheck
    expect(fetchCalls).toHaveLength(0);
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(0);
  });

  it('missing pb → merge stage skipped without throwing', async () => {
    const hot = { hasFingerprint: async () => false };
    const cold = makeCold();
    const fetchCalls: string[] = [];
    const fetchFn = async () => {
      fetchCalls.push('x');
      return { markdown: 'x', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const def = makeDef();
    const candidates = [{ ...baseCandidate }];

    // No pb — should not throw, merge stage skipped, candidate processing skipped entirely
    await expect(runPollTick(def, logger.log as any, { hot, cold, fetch: fetchFn, candidates })).resolves.toBeDefined();

    expect(fetchCalls).toHaveLength(0);
    expect(mockedCreateMergeStore).not.toHaveBeenCalled();
  });
});
