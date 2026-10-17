// TBA re-audit loop tests — tests tbaReauditScan with fakes.
// Mirrors orchestrator.test.ts fake patterns.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tbaReauditScan } from './tba-loop.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface FakeCollections {
  opportunities: {
    getList: (page: number, perPage: number, opts?: unknown) => Promise<{ items: unknown[]; totalItems: number }>;
    update: ReturnType<typeof vi.fn>;
    __updated__: Array<{ id: string; data: Record<string, unknown> }>;
  };
  tombstone_ledger: {
    create: ReturnType<typeof vi.fn>;
    __created__: unknown[];
  };
}

function makePb(opts: {
  tbaRows: unknown[];
}): { pb: any; collections: FakeCollections } {
  const updated: Array<{ id: string; data: Record<string, unknown> }> = [];
  const created: unknown[] = [];
  const rows = [...opts.tbaRows];

  const collections: FakeCollections = {
    opportunities: {
      getList: async (_page: number, _perPage: number, opts?: unknown) => {
        const filter = (opts as any)?.filter as string | undefined;
        let items = [...rows];
        if (filter && filter.includes('deadlines.tba = true')) {
          items = items.filter((r: any) => r.deadlines?.tba === true);
        }
        if (filter && filter.includes('updated <')) {
          const ts = filter.match(/updated < '([^']+)'/)?.[1];
          if (ts) {
            items = items.filter((r: any) => new Date(r.updated) < new Date(ts));
          }
        }
        return { items, totalItems: items.length };
      },
      update: vi.fn(async (id: string, data: Record<string, unknown>) => {
        updated.push({ id, data });
      }),
      __updated__: updated,
    },
    tombstone_ledger: {
      create: vi.fn(async (data: Record<string, unknown>) => {
        created.push(data);
        return { id: `ts-${created.length}` };
      }),
      __created__: created,
    },
  };

  const pb: any = {
    collection: (name: string) => {
      if (name === 'opportunities') return collections.opportunities;
      if (name === 'tombstone_ledger') return collections.tombstone_ledger;
      throw new Error(`unknown collection: ${name}`);
    },
  };
  return { pb, collections };
}

function makeRouter(verdictFn: () => unknown) {
  return {
    complete: vi.fn(async (_opts: unknown) => ({ verdict: verdictFn(), bucket: 'tier1/groq:test', path: [], reason: undefined })),
  };
}

function makeTbaRow(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'tba-row-1',
    pipeline: 'events',
    title: 'TBA Event 2026',
    description_raw: 'A tech event with TBA prize and date. Organized by Test Org.',
    links: { official: 'https://example.com/event/tba-2026' },
    status: 'audited',
    deadlines: { tba: true },
    updated: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tbaReauditScan', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('scans only TBA rows older than 48h', async () => {
    const oldTbaRow = makeTbaRow({ id: 'tba-old', updated: '2026-10-01T00:00:00Z' });
    const newTbaRow = makeTbaRow({ id: 'tba-new', updated: new Date().toISOString() });
    const nonTbaRow = makeTbaRow({ id: 'tba-non-tba', deadlines: { tba: false }, updated: '2026-10-01T00:00:00Z' });

    const { pb, collections } = makePb({ tbaRows: [oldTbaRow, newTbaRow, nonTbaRow] });
    const router = makeRouter(() => 'UNVERIFIED');

    await tbaReauditScan({ pb, router });

    // Only the old TBA row should be scanned (UNVERIFIED → keep TBA, update timestamp)
    const updates = collections.opportunities.__updated__;
    expect(updates.length).toBe(1);
    expect(updates[0].id).toBe('tba-old');
    expect(updates[0].data.deadlines.tba).toBe(true);
  });

  it('Ping #2 confirmed: prize_cash_inr now set → tba=false, status audited, bucket TBA radar', async () => {
    const tbaRow = makeTbaRow({ id: 'tba-confirmed' });
    const { pb, collections } = makePb({ tbaRows: [tbaRow] });

    const router = makeRouter(() => ({
      title: 'TBA Event 2026',
      organizer: 'Test Org',
      location: 'Online',
      isOffline: false,
      hasSelectionRound: false,
      organizer_score: 7,
      category: 'general',
      prize_cash_inr: 150000,
      prize_text: '₹1,50,000 cash',
      perk_hint: null,
      dates: { start: '2026-12-15T09:00:00Z', end: '2026-12-16T18:00:00Z' },
      agenda_score: 7,
      audit_summary: 'TBA event now confirmed, ₹1.5L cash prize',
    }));

    await tbaReauditScan({ pb, router });

    const updates = collections.opportunities.__updated__;
    expect(updates.length).toBe(1);
    expect(updates[0].id).toBe('tba-confirmed');
    expect(updates[0].data.deadlines.tba).toBe(false);
    expect(updates[0].data.status).toBe('audited');
    expect(updates[0].data.bucket_channel).toBe('#⏳-early-tba-radar');
    expect(updates[0].data.prize_cash_inr).toBe(150000);
    expect(updates[0].data.prize_text).toBe('₹1,50,000 cash');
    expect(collections.tombstone_ledger.__created__).toHaveLength(0);
  });

  it('Ping #2 confirmed: dates now set → tba=false, deadlines updated', async () => {
    const tbaRow = makeTbaRow({ id: 'tba-dates-confirmed' });
    const { pb, collections } = makePb({ tbaRows: [tbaRow] });

    const router = makeRouter(() => ({
      title: 'TBA Event 2026',
      organizer: 'Test Org',
      location: 'Online',
      isOffline: false,
      hasSelectionRound: false,
      organizer_score: 7,
      category: 'general',
      prize_cash_inr: null,
      prize_text: 'TBA',
      perk_hint: null,
      dates: { start: '2026-12-15T09:00:00Z', end: '2026-12-16T18:00:00Z' },
      agenda_score: 7,
      audit_summary: 'TBA event dates now confirmed',
    }));

    await tbaReauditScan({ pb, router });

    const updates = collections.opportunities.__updated__;
    expect(updates[0].data.deadlines.tba).toBe(false);
    expect(updates[0].data.deadlines.event_start).toBe('2026-12-15T09:00:00Z');
    expect(updates[0].data.deadlines.event_end).toBe('2026-12-16T18:00:00Z');
    expect(updates[0].data.bucket_channel).toBe('#⏳-early-tba-radar');
  });

  it('Ping #2 expired: event date passed → tba=false, status expired, tombstone event_expired', async () => {
    const pastDate = new Date(Date.now() - 10_000_000).toISOString(); // ~0.12 days ago
    const tbaRow = makeTbaRow({ id: 'tba-expired' });
    const { pb, collections } = makePb({ tbaRows: [tbaRow] });

    const router = makeRouter(() => ({
      title: 'TBA Event 2026',
      organizer: 'Test Org',
      location: 'Online',
      isOffline: false,
      hasSelectionRound: false,
      organizer_score: 7,
      category: 'general',
      prize_cash_inr: null,
      prize_text: 'TBA',
      perk_hint: null,
      dates: { start: pastDate, end: pastDate },
      agenda_score: 7,
      audit_summary: 'TBA event, date passed',
    }));

    await tbaReauditScan({ pb, router });

    const updates = collections.opportunities.__updated__;
    expect(updates[0].data.deadlines.tba).toBe(false);
    expect(updates[0].data.status).toBe('expired');
    expect(collections.tombstone_ledger.__created__).toHaveLength(1);
    const ts = collections.tombstone_ledger.__created__[0];
    expect(ts.terminal_status).toBe('event_expired');
    expect(ts.source).toBe('tba-loop');
  });

  it('Still TBA after re-audit → keeps tba=true, refreshes updated timestamp', async () => {
    const tbaRow = makeTbaRow({ id: 'tba-still-tba' });
    const { pb, collections } = makePb({ tbaRows: [tbaRow] });

    const router = makeRouter(() => ({
      title: 'TBA Event 2026',
      organizer: 'Test Org',
      location: 'Online',
      isOffline: false,
      hasSelectionRound: false,
      organizer_score: 7,
      category: 'general',
      prize_cash_inr: null,
      prize_text: 'TBA',
      perk_hint: null,
      dates: null,
      agenda_score: 7,
      audit_summary: 'TBA event, still TBA',
    }));

    await tbaReauditScan({ pb, router });

    const updates = collections.opportunities.__updated__;
    expect(updates[0].data.deadlines.tba).toBe(true);
    // Timestamp refreshed (not the original old date)
    expect(new Date(updates[0].data.updated).getTime()).toBeGreaterThan(new Date('2026-10-01T00:00:00Z').getTime());
  });

  it('UNVERIFIED verdict → keeps TBA, refreshes timestamp', async () => {
    const tbaRow = makeTbaRow({ id: 'tba-unverified' });
    const { pb, collections } = makePb({ tbaRows: [tbaRow] });
    const router = makeRouter(() => 'UNVERIFIED');

    await tbaReauditScan({ pb, router });

    const updates = collections.opportunities.__updated__;
    expect(updates.length).toBe(1);
    expect(updates[0].data.deadlines.tba).toBe(true);
  });

  it('POOL_SATURATED verdict → keeps TBA, refreshes timestamp', async () => {
    const tbaRow = makeTbaRow({ id: 'tba-pool-sat' });
    const { pb, collections } = makePb({ tbaRows: [tbaRow] });
    const router = makeRouter(() => 'POOL_SATURATED');

    await tbaReauditScan({ pb, router });

    const updates = collections.opportunities.__updated__;
    expect(updates.length).toBe(1);
    expect(updates[0].data.deadlines.tba).toBe(true);
  });

  it('verdict parse failure → keeps TBA, refreshes timestamp', async () => {
    const tbaRow = makeTbaRow({ id: 'tba-parse-fail' });
    const { pb, collections } = makePb({ tbaRows: [tbaRow] });
    // Missing required fields → parse failure
    const router = makeRouter(() => ({ title: 'x' }));

    await tbaReauditScan({ pb, router });

    const updates = collections.opportunities.__updated__;
    expect(updates.length).toBe(1);
    expect(updates[0].data.deadlines.tba).toBe(true);
  });

  it('local pipeline TBA row → re-audited with local rule pack', async () => {
    const tbaRow = makeTbaRow({
      id: 'tba-local',
      pipeline: 'local',
      title: 'Local TBA Event',
      description_raw: 'A local DK event with TBA prize.',
      links: { official: 'https://nitk.edu.in/event/tba-local' },
    });
    const { pb, collections } = makePb({ tbaRows: [tbaRow] });

    const router = makeRouter(() => ({
      title: 'Local TBA Event',
      organizer: 'NITK',
      location: 'DK',
      isOffline: true,
      hasSelectionRound: false,
      organizer_score: 7,
      category: 'general',
      prize_cash_inr: null,
      prize_text: 'TBA',
      perk_hint: null,
      dates: null,
      audit_summary: 'Local DK event, still TBA',
    }));

    await tbaReauditScan({ pb, router });

    const updates = collections.opportunities.__updated__;
    expect(updates[0].data.deadlines.tba).toBe(true);
  });

  it('per-row isolation: one row failure does not abort the batch', async () => {
    const goodRow = makeTbaRow({ id: 'tba-good' });
    const { pb, collections } = makePb({ tbaRows: [goodRow] });

    let callCount = 0;
    const router = makeRouter(() => {
      callCount++;
      if (callCount === 1) throw new Error('tba router boom');
      return {
        title: 'TBA Event 2026',
        organizer: 'Test Org',
        location: 'Online',
        isOffline: false,
        hasSelectionRound: false,
        organizer_score: 7,
        category: 'general',
        prize_cash_inr: 150000,
        prize_text: '₹1,50,000 cash',
        perk_hint: null,
        dates: { start: '2026-12-15T09:00:00Z', end: '2026-12-16T18:00:00Z' },
        audit_summary: 'Confirmed',
      };
    });

    await tbaReauditScan({ pb, router });

    // Router called once (one row), threw, but batch continues (no more rows)
    expect(callCount).toBe(1);
  });
});
