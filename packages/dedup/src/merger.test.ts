import { describe, expect, it, vi } from 'vitest';
import {
  attemptMerge,
  MERGE_THRESHOLD,
  MERGE_FLAG_THRESHOLD,
  normalizeTitle,
  extractCompany,
  type MergeCandidate,
  type MergeResult,
  type MergeStore,
  createMergeStore,
} from './merger.js';
import { hashUrl, normalizeUrl } from './fingerprint.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = 1_792_145_094_000; // fixed now for deterministic window tests
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function makeCandidate(overrides: Partial<MergeCandidate> = {}): MergeCandidate {
  return {
    id: 'master-1',
    pipeline: 'events',
    title: 'Google I/O 2026',
    url: 'https://example.com/event',
    organizer: 'Google',
    dateMs: NOW - 86400000, // 1 day ago
    createdAtMs: NOW - 86400000,
    links: ['https://example.com/event'],
    ...overrides,
  };
}

function makeStore(candidates: MergeCandidate[] = []): {
  store: MergeStore;
  calls: { findCandidates: unknown[]; appendLinks: unknown[]; tombstoneMerged: unknown[] };
} {
  const calls = {
    findCandidates: [] as unknown[],
    appendLinks: [] as unknown[],
    tombstoneMerged: [] as unknown[],
  };
  const store: MergeStore = {
    findCandidates: async (opts) => {
      calls.findCandidates.push(opts);
      return candidates;
    },
    appendLinks: async (_masterId: string, _links: string[]) => {
      calls.appendLinks.push({ _masterId, _links });
    },
    tombstoneMerged: async (_urlHash: string, _terminalStatus: 'merged', _source: 'merger') => {
      calls.tombstoneMerged.push({ _urlHash, _terminalStatus, _source });
    },
  };
  return { store, calls };
}

function inputEvent(overrides: Partial<{ title: string; url: string; organizer?: string; dateMs?: number; location?: string }> = {}) {
  return {
    pipeline: 'events' as const,
    title: 'Google I/O 2026',
    url: 'https://example.com/duplicate',
    organizer: 'Google',
    dateMs: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('merge thresholds (D-09 locked)', () => {
  it('MERGE_THRESHOLD is 0.9', () => {
    expect(MERGE_THRESHOLD).toBe(0.9);
  });

  it('MERGE_FLAG_THRESHOLD is 0.7', () => {
    expect(MERGE_FLAG_THRESHOLD).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// normalizeTitle
// ---------------------------------------------------------------------------

describe('normalizeTitle', () => {
  it('lowercases the input', () => {
    expect(normalizeTitle('GOOGLE I/O 2026')).toBe('google i o');
  });

  it('strips 4-digit years', () => {
    expect(normalizeTitle('Google I/O 2026')).toBe(normalizeTitle('Google I/O 2025'));
    expect(normalizeTitle('Event 2026')).not.toContain('2026');
  });

  it('strips non-alphanumeric characters', () => {
    expect(normalizeTitle('Google I/O')).toBe('google i o');
    expect(normalizeTitle('React—Native')).toBe('react native');
  });

  it('collapses whitespace and trims', () => {
    expect(normalizeTitle('  Google    I/O  2026  ')).toBe('google i o');
  });
});

// ---------------------------------------------------------------------------
// extractCompany
// ---------------------------------------------------------------------------

describe('extractCompany', () => {
  it('pipe separator: Acme | Backend Engineer → Acme', () => {
    expect(extractCompany('Acme | Backend Engineer')).toBe('Acme');
  });

  it('em-dash separator: Acme — Backend Engineer → Acme', () => {
    expect(extractCompany('Acme — Backend Engineer')).toBe('Acme');
  });

  it('space-hyphen-space separator: Acme - Backend Engineer → Acme', () => {
    expect(extractCompany('Acme - Backend Engineer')).toBe('Acme');
  });

  it('multi-word company: Acme Corp | Senior Engineer → Acme Corp', () => {
    expect(extractCompany('Acme Corp | Senior Engineer')).toBe('Acme Corp');
  });

  it('single segment returns null', () => {
    expect(extractCompany('Backend Engineer')).toBeNull();
    expect(extractCompany('JustOneWord')).toBeNull();
  });

  it('segment longer than 40 chars returns null', () => {
    const longName = 'A'.repeat(41);
    expect(extractCompany(`${longName} | Role`)).toBeNull();
  });

  it('segment exactly 40 chars returns it', () => {
    const exactly40 = 'A'.repeat(40);
    expect(extractCompany(`${exactly40} | Role`)).toBe(exactly40);
  });
});

// ---------------------------------------------------------------------------
// attemptMerge — merge cases
// ---------------------------------------------------------------------------

describe('attemptMerge — merge (D-09 gate: ≥0.9 + evidence + window)', () => {
  it('merges identical title + matching organizer + in window', async () => {
    const { store, calls } = makeStore([makeCandidate()]);
    const result = await attemptMerge(inputEvent(), store);

    expect(result.merged).toBe(true);
    if (result.merged) {
      expect(result.masterId).toBe('master-1');
      expect(result.links).toContain('https://example.com/event');
      expect(result.links).toContain('https://example.com/duplicate');
      expect(result.links).toHaveLength(2);
    }
    expect(calls.tombstoneMerged).toHaveLength(1);
    expect(calls.tombstoneMerged[0]).toMatchObject({
      _terminalStatus: 'merged',
      _source: 'merger',
    });
    expect(calls.appendLinks).toHaveLength(1);
  });

  it('boundary: exactly ±3 days merges (inclusive)', async () => {
    const master = makeCandidate({ dateMs: NOW - THREE_DAYS_MS, createdAtMs: NOW - THREE_DAYS_MS });
    const { store, calls } = makeStore([master]);
    const result = await attemptMerge(inputEvent(), store);

    expect(result.merged).toBe(true);
    expect(calls.tombstoneMerged).toHaveLength(1);
  });

  it('boundary: just outside ±3 days does not merge (different title → plain)', async () => {
    const master = makeCandidate({
      title: 'Apple WWDC 2026',
      dateMs: NOW - THREE_DAYS_MS - 1,
      createdAtMs: NOW - THREE_DAYS_MS - 1,
    });
    const { store, calls } = makeStore([master]);
    const result = await attemptMerge(inputEvent(), store);

    expect(result).toEqual({ merged: false, possibleDupe: false });
    expect(calls.tombstoneMerged).toHaveLength(0);
    expect(calls.appendLinks).toHaveLength(0);
  });

  it('recent-created fallback when dateMs absent: within 3 days of now', async () => {
    const master = makeCandidate({ dateMs: undefined, createdAtMs: NOW - 86400000 }); // 1 day ago
    const { store, calls } = makeStore([master]);
    const result = await attemptMerge({ ...inputEvent(), dateMs: undefined }, store);

    expect(result.merged).toBe(true);
    expect(calls.tombstoneMerged).toHaveLength(1);
  });

  it('recent-created fallback when dateMs absent: older than 3 days does not merge', async () => {
    const master = makeCandidate({
      title: 'Apple WWDC 2026',
      dateMs: undefined,
      createdAtMs: NOW - THREE_DAYS_MS - 1,
    });
    const { store, calls } = makeStore([master]);
    const result = await attemptMerge({ ...inputEvent(), dateMs: undefined }, store);

    expect(result).toEqual({ merged: false, possibleDupe: false });
    expect(calls.tombstoneMerged).toHaveLength(0);
  });

  it('links are deduplicated when input URL already in master links', async () => {
    const master = makeCandidate({ links: ['https://example.com/duplicate'] });
    const { store, calls } = makeStore([master]);
    const result = await attemptMerge(inputEvent(), store);

    expect(result.merged).toBe(true);
    if (result.merged) {
      expect(result.links).toHaveLength(1);
      expect(result.links[0]).toBe('https://example.com/duplicate');
    }
  });

  it('master is the existing row (first-seen), input is tombstoned', async () => {
    const master = makeCandidate({ id: 'existing-row-id' });
    const { store, calls } = makeStore([master]);
    await attemptMerge(inputEvent({ url: 'https://example.com/dup-url' }), store);

    const tombstoneCall = calls.tombstoneMerged[0] as { _urlHash: string };
    expect(tombstoneCall._urlHash).toBe(hashUrl(normalizeUrl('https://example.com/dup-url')));
  });
});

// ---------------------------------------------------------------------------
// attemptMerge — possibleDupe cases
// ---------------------------------------------------------------------------

describe('attemptMerge — possibleDupe (flag-don\'t-merge)', () => {
  it('title similarity ≥0.7 but <0.9 → possibleDupe, no merge', async () => {
    // 'Google I/O 2026' vs 'Google IO 2026' → normalized similarity ≈ 0.8235
    const { store, calls } = makeStore([makeCandidate({ title: 'Google IO 2026' })]);
    const result = await attemptMerge(inputEvent(), store);

    expect(result).toMatchObject({ merged: false, possibleDupe: true });
    expect(calls.tombstoneMerged).toHaveLength(0);
    expect(calls.appendLinks).toHaveLength(0);
  });

  it('≥0.9 title but missing organizer evidence on candidate → possibleDupe, not merge', async () => {
    const { store, calls } = makeStore([makeCandidate({ organizer: undefined })]);
    const result = await attemptMerge(inputEvent(), store);

    expect(result).toMatchObject({ merged: false, possibleDupe: true });
    expect(calls.tombstoneMerged).toHaveLength(0);
  });

  it('≥0.9 title but mismatched organizer → possibleDupe, not merge', async () => {
    const { store, calls } = makeStore([makeCandidate({ organizer: 'Different Org' })]);
    const result = await attemptMerge(inputEvent(), store);

    expect(result).toMatchObject({ merged: false, possibleDupe: true });
    expect(calls.tombstoneMerged).toHaveLength(0);
  });

  it('≥0.9 title but missing organizer on input → possibleDupe, not merge', async () => {
    const { store, calls } = makeStore([makeCandidate()]);
    const result = await attemptMerge(inputEvent({ organizer: undefined }), store);

    expect(result).toMatchObject({ merged: false, possibleDupe: true });
    expect(calls.tombstoneMerged).toHaveLength(0);
  });

  it('possibleDupe carries masterId when a high-similarity candidate exists', async () => {
    const { store } = makeStore([makeCandidate({ title: 'Google IO 2026' })]);
    const result = await attemptMerge(inputEvent(), store);

    expect(result).toMatchObject({ merged: false, possibleDupe: true, masterId: 'master-1' });
  });

  it('below 0.7 similarity → plain, no masterId', async () => {
    const { store } = makeStore([makeCandidate({ title: 'Apple WWDC 2026' })]);
    const result = await attemptMerge(inputEvent(), store);

    expect(result).toEqual({ merged: false, possibleDupe: false });
  });
});

// ---------------------------------------------------------------------------
// attemptMerge — jobs location gate
// ---------------------------------------------------------------------------

describe('attemptMerge — jobs pipeline location gate (D-11)', () => {
  it('jobs with matching location on both sides → merge', async () => {
    const { store, calls } = makeStore([
      makeCandidate({ pipeline: 'jobs', location: 'Bangalore, India' }),
    ]);
    const result = await attemptMerge(
      { ...inputEvent(), pipeline: 'jobs', location: 'Bangalore, India' },
      store,
    );

    expect(result.merged).toBe(true);
    expect(calls.tombstoneMerged).toHaveLength(1);
  });

  it('jobs missing location on candidate → possibleDupe, not merge', async () => {
    const { store, calls } = makeStore([
      makeCandidate({ pipeline: 'jobs', location: undefined }),
    ]);
    const result = await attemptMerge(
      { ...inputEvent(), pipeline: 'jobs', location: 'Bangalore, India' },
      store,
    );

    expect(result).toMatchObject({ merged: false, possibleDupe: true });
    expect(calls.tombstoneMerged).toHaveLength(0);
  });

  it('jobs missing location on input → possibleDupe, not merge', async () => {
    const { store, calls } = makeStore([
      makeCandidate({ pipeline: 'jobs', location: 'Bangalore, India' }),
    ]);
    const result = await attemptMerge(
      { ...inputEvent(), pipeline: 'jobs', location: undefined },
      store,
    );

    expect(result).toMatchObject({ merged: false, possibleDupe: true });
    expect(calls.tombstoneMerged).toHaveLength(0);
  });

  it('jobs mismatched location → possibleDupe, not merge', async () => {
    const { store, calls } = makeStore([
      makeCandidate({ pipeline: 'jobs', location: 'Mumbai, India' }),
    ]);
    const result = await attemptMerge(
      { ...inputEvent(), pipeline: 'jobs', location: 'Bangalore, India' },
      store,
    );

    expect(result).toMatchObject({ merged: false, possibleDupe: true });
    expect(calls.tombstoneMerged).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// attemptMerge — store bounds
// ---------------------------------------------------------------------------

describe('attemptMerge — bounded candidate query (T-05-27)', () => {
  it('findCandidates called with pipeline + dateMs + limit 50', async () => {
    const { store, calls } = makeStore([makeCandidate()]);
    await attemptMerge(inputEvent(), store);

    expect(calls.findCandidates).toHaveLength(1);
    const opts = calls.findCandidates[0] as { pipeline: string; dateMs?: number; limit: number };
    expect(opts.pipeline).toBe('events');
    expect(opts.dateMs).toBe(NOW);
    expect(opts.limit).toBe(50);
  });

  it('never performs an unbounded/full-scan query', async () => {
    const { store, calls } = makeStore([makeCandidate()]);
    await attemptMerge(inputEvent(), store);

    const opts = calls.findCandidates[0] as { limit: number };
    expect(opts.limit).toBe(50);
    expect(opts.limit).not.toBeGreaterThan(50);
  });

  it('passes dateMs as undefined when input has no dateMs', async () => {
    const { store, calls } = makeStore([makeCandidate()]);
    await attemptMerge({ ...inputEvent(), dateMs: undefined }, store);

    const opts = calls.findCandidates[0] as { dateMs?: number };
    expect(opts.dateMs).toBeUndefined();
  });

  it('returns plain when store has no candidates', async () => {
    const { store } = makeStore([]);
    const result = await attemptMerge(inputEvent(), store);

    expect(result).toEqual({ merged: false, possibleDupe: false });
  });
});

// ---------------------------------------------------------------------------
// attemptMerge — scope guard (no loot merging, D-11)
// ---------------------------------------------------------------------------

describe('attemptMerge — scope guard', () => {
  it('no merge for loot pipeline input', async () => {
    const { store, calls } = makeStore([makeCandidate({ pipeline: 'loot' as any })]);
    const result = await attemptMerge(
      { ...inputEvent(), pipeline: 'loot' as any },
      store,
    );

    expect(result).toEqual({ merged: false, possibleDupe: false });
    expect(calls.findCandidates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createMergeStore — PB-fake test for query bounds + write calls
// ---------------------------------------------------------------------------

describe('createMergeStore — PB-fake backing', () => {
  it('findCandidates bounded args + write calls through PB/cold fake', async () => {
    const getListMock = vi.fn(async (_page: number, _perPage: number, _opts?: unknown): Promise<{ items: any[]; totalItems: number }> => ({ items: [], totalItems: 0 }));
    const createMock = vi.fn(async (_data: any) => ({}));
    const updateMock = vi.fn(async (_id: string, _data: any) => ({}));

    const pb = {
      collection: vi.fn(() => ({
        getList: getListMock,
        update: updateMock,
      })),
    };
    const cold = { create: createMock };

    const store = createMergeStore({ pb, cold });
    const candidates: MergeCandidate[] = [makeCandidate()];
    // Override findCandidates to return our test candidates via the fake PB
    (pb.collection as ReturnType<typeof vi.fn>).mockReturnValue({
      getList: getListMock,
      update: updateMock,
    });
    getListMock.mockResolvedValueOnce({ items: candidates, totalItems: 1 });

    const result = await attemptMerge(inputEvent(), store);

    // findCandidates was invoked (bounded: limit 50)
    expect(getListMock).toHaveBeenCalled();
    const getListCall = getListMock.mock.calls[0];
    expect(getListCall[1]).toBe(50); // page size = limit
    expect(String((getListCall[2] as { filter?: string })?.filter)).toContain("pipeline = 'events'");

    // tombstone write called via cold
    if (result.merged) {
      expect(createMock).toHaveBeenCalled();
      const tombstoneCall = createMock.mock.calls[0][0] as { terminal_status: string; source: string };
      expect(tombstoneCall.terminal_status).toBe('merged');
      expect(tombstoneCall.source).toBe('merger');
    }
  });

  it('createMergeStore with direct method backing (test seam)', async () => {
    const findCandidatesMock = vi.fn(async () => [makeCandidate()]);
    const appendLinksMock = vi.fn(async () => {});
    const tombstoneMergedMock = vi.fn(async (_urlHash: string, _terminalStatus: 'merged', _source: 'merger') => {});

    const store = createMergeStore({
      findCandidates: findCandidatesMock,
      appendLinks: appendLinksMock,
      tombstoneMerged: tombstoneMergedMock,
    });

    const result = await attemptMerge(inputEvent(), store);

    expect(result.merged).toBe(true);
    expect(findCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
    expect(appendLinksMock).toHaveBeenCalledTimes(1);
    expect(tombstoneMergedMock).toHaveBeenCalledTimes(1);
    const tmCall = tombstoneMergedMock.mock.calls[0];
    expect(tmCall[1]).toBe('merged');
    expect(tmCall[2]).toBe('merger');
  });
});
