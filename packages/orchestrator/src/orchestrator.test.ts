// Orchestrator drainStep2Rows loot branch tests.
// Tests the loot drain branch (readLootRules → loot rule pack → router → gates →
// write/tombstone) using fakes, mirroring e2e-tracer.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainStep2Rows } from './orchestrator.js';
import type { TaskScratchpadRow } from '@zod/db-hot/schema';

const FAQ_TEXT =
  '# CKA Exam FAQ\n\nThe CKA exam voucher is free for CNCF members. No credit card is required. ' +
  'Shipping is worldwide at no additional cost. Claim steps: 1. Register at the CNCF training portal. ' +
  '2. Redeem the voucher code at checkout. '.repeat(120);

// ---------------------------------------------------------------------------
// Fakes (same shape as e2e-tracer.test.ts)
// ---------------------------------------------------------------------------

interface FakeCollections {
  scratchpad: {
    getList: (page: number, perPage: number, opts?: unknown) => Promise<{ items: TaskScratchpadRow[]; totalItems: number }>;
    update: ReturnType<typeof vi.fn>;
  };
  opportunities: {
    create: ReturnType<typeof vi.fn>;
    getList: (page: number, perPage: number, opts?: unknown) => Promise<{ items: unknown[]; totalItems: number }>;
    __created__: unknown[];
  };
  tombstone_ledger: {
    create: ReturnType<typeof vi.fn>;
    __created__: unknown[];
  };
}

function makePb(opts: {
  scratchpadRows: TaskScratchpadRow[];
  existingOpportunities: unknown[];
}): { pb: any; collections: FakeCollections } {
  const opportunities: unknown[] = [...opts.existingOpportunities];
  const rows = new Map<string, TaskScratchpadRow>();
  for (const r of opts.scratchpadRows) rows.set(r.id, r);

  const collections: FakeCollections = {
    scratchpad: {
      getList: async (_page: number, _perPage: number, opts?: unknown) => {
        const filter = (opts as any)?.filter as string | undefined;
        let items = [...rows.values()];
        if (filter && filter.includes("step_position = 'STEP_2'")) {
          items = items.filter((r) => r.step_position === 'STEP_2');
        }
        return { items, totalItems: items.length };
      },
      update: vi.fn(async (_id: string, _data: Record<string, unknown>) => {
        // no-op: record calls for assertion
      }),
    },
    opportunities: {
      create: vi.fn(async (data: Record<string, unknown>) => {
        opportunities.push({ id: `opp-${opportunities.length + 1}`, ...data });
        return { id: `opp-${opportunities.length}` };
      }),
      getList: async (_page: number, _perPage: number, opts?: unknown) => {
        const filter = (opts as any)?.filter as string | undefined;
        if (filter && filter.includes('url_hash')) {
          const urlHash = filter.match(/url_hash = '([^']+)'/)?.[1];
          const matched = opportunities.filter((o: any) => o.url_hash === urlHash);
          return { items: matched, totalItems: matched.length };
        }
        return { items: opportunities, totalItems: opportunities.length };
      },
      __created__: opportunities,
    },
    tombstone_ledger: {
      create: vi.fn(async (data: Record<string, unknown>) => {
        return { id: `ts-${Date.now()}` };
      }),
      __created__: [] as unknown[],
    },
  };

  const pb: any = {
    collection: (name: string) => {
      if (name === 'task_scratchpad') return collections.scratchpad;
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

function makeLootScratchRow(overrides: Partial<TaskScratchpadRow> = {}): TaskScratchpadRow {
  return {
    id: 'scratch-loot-1',
    created: '2026-10-16T08:00:00Z',
    updated: '2026-10-16T08:00:00Z',
    candidate_url: 'https://aggregator.example.com/faq',
    step_position: 'STEP_2',
    pipeline: 'loot',
    candidate_title: 'CKA Certification Exam Voucher',
    partial_buffer: '',
    attempts: 0,
    last_error: null,
    ...overrides,
  } as TaskScratchpadRow;
}

/** Install a fetch mock that makes readLootRules succeed via a 2-hop chain. */
function installSuccessFetch(): void {
  const mockFetch = vi.fn();
  mockFetch.mockImplementation(async (input: any) => {
    const url = String(input);
    if (url.startsWith('https://r.jina.ai/')) {
      return new Response(FAQ_TEXT, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (url === 'https://aggregator.example.com/faq') {
      return new Response(null, { status: 302, headers: { location: 'https://intermediate.example.com/faq' } });
    }
    if (url === 'https://intermediate.example.com/faq') {
      return new Response(null, { status: 302, headers: { location: 'https://official.example.com/faq' } });
    }
    if (url === 'https://official.example.com/faq') {
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal('fetch', mockFetch);
}

/** Install a fetch mock that makes readLootRules fail (SSRF/private hop). */
function installHopFailureFetch(): void {
  const mockFetch = vi.fn();
  mockFetch.mockImplementation(async () => {
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
  });
  vi.stubGlobal('fetch', mockFetch);
}

const fullLootVerdict = {
  perk: 'Free CKA exam voucher',
  perk_description: 'Certified Kubernetes Administrator exam voucher',
  shipping_verified: true,
  shipping_region: 'india',
  shipping_quote: 'Ships to India at no cost',
  card_required: false,
  offer_cost: 'free',
  claim_steps: [
    { step: 'Register at the portal', quote: 'Register at the portal' },
    { step: 'Redeem code at checkout', quote: 'Redeem code at checkout' },
  ],
  audit_summary: 'Free CKA voucher, India shipping, no card',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('orchestrator drainStep2Rows loot branch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('admit verdict creates one audited loot opportunities row with loot fields + bucket', async () => {
    installSuccessFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeLootScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({ ...fullLootVerdict }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    const opp = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opp.status).toBe('audited');
    expect(opp.pipeline).toBe('loot');
    expect(opp.bucket_channel).toBe('#🎁-free-swag-and-credits');
    expect(opp.shipping_verified).toBe(true);
    expect(opp.card_required).toBe(false);
    expect(opp.claim_steps).toEqual([
      { step: 'Register at the portal', quote: 'Register at the portal' },
      { step: 'Redeem code at checkout', quote: 'Redeem code at checkout' },
    ]);
    expect(opp.audit_summary).toBe('Free CKA voucher, India shipping, no card');

    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-loot-1', { step_position: 'STEP_3' });
    expect(collections.tombstone_ledger.create).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('reject verdict (US/EU-only) writes tombstone verbatim, no opportunities row', async () => {
    installSuccessFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeLootScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({ ...fullLootVerdict, shipping_region: 'us' }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();

    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = (collections.tombstone_ledger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('loot_us_eu_only');
    expect(tsCall.source).toBe('auditor');

    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-loot-1', { step_position: 'STEP_3' });
    vi.unstubAllGlobals();
  });

  it('re-drain against same url_hash creates no second opportunities row', async () => {
    installSuccessFetch();
    const existingOpp = {
      id: 'opp-existing',
      url_hash: 'bec98c8db2bb737090363a9cdaac445e4c88987c8f9789da393913591b8e9261',
      status: 'audited',
      pipeline: 'loot',
    };
    const { pb, collections } = makePb({
      scratchpadRows: [makeLootScratchRow({ candidate_url: 'https://aggregator.example.com/faq' })],
      existingOpportunities: [existingOpp],
    });

    const router = makeRouter(() => ({ ...fullLootVerdict }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('UNVERIFIED verdict writes nothing and leaves row at STEP_2', async () => {
    installSuccessFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeLootScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => 'UNVERIFIED');

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).not.toHaveBeenCalled();
    expect(collections.scratchpad.update).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('POOL_SATURATED verdict writes nothing and leaves row at STEP_2', async () => {
    installSuccessFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeLootScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => 'POOL_SATURATED');

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).not.toHaveBeenCalled();
    expect(collections.scratchpad.update).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('orchestrator loot branch link_hop_failed (fetch mocked)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('tombstones link_hop_failed when readLootRules returns null', async () => {
    installHopFailureFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeLootScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => 'UNVERIFIED'); // router won't be called if readLootRules fails

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = (collections.tombstone_ledger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('link_hop_failed');
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-loot-1', { step_position: 'STEP_3' });
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Events scratch row helper
// ---------------------------------------------------------------------------

function makeEventsScratchRow(overrides: Partial<TaskScratchpadRow> = {}): TaskScratchpadRow {
  return {
    id: 'scratch-events-1',
    created: '2026-10-16T08:00:00Z',
    updated: '2026-10-16T08:00:00Z',
    candidate_url: 'https://devpost.com/event/hackathon-2026',
    step_position: 'STEP_2',
    pipeline: 'events',
    candidate_title: 'National CTF 2026',
    partial_buffer: '',
    attempts: 0,
    last_error: null,
    ...overrides,
  } as TaskScratchpadRow;
}

/** Install a fetch mock that makes resolveOfficialDomain succeed via a 2-hop chain. */
function installEventsFetch(): void {
  const mockFetch = vi.fn();
  mockFetch.mockImplementation(async (input: any) => {
    const url = String(input);
    if (url.startsWith('https://r.jina.ai/')) {
      return new Response('event page markdown', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (url === 'https://devpost.com/event/hackathon-2026') {
      return new Response(null, { status: 302, headers: { location: 'https://intermediate.example.com/event' } });
    }
    if (url === 'https://intermediate.example.com/event') {
      return new Response(null, { status: 302, headers: { location: 'https://official.example.com/event' } });
    }
    if (url === 'https://official.example.com/event') {
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal('fetch', mockFetch);
}

const fullEventsVerdict = {
  title: 'National CTF 2026',
  organizer: 'CyberSec India',
  category: 'sys-cp-sec',
  prize_cash_inr: 150000,
  prize_text: '₹1,50,000 cash',
  organizer_score: 9,
  agenda_score: 9,
  dates: { start: '2026-12-15T09:00:00Z', end: '2026-12-16T18:00:00Z' },
  audit_summary: 'Verified CTF infosec event, ₹1.5L cash prize, India-organized',
  perk_hint: null,
};

// ---------------------------------------------------------------------------
// Events branch tests
// ---------------------------------------------------------------------------

describe('orchestrator drainStep2Rows events branch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('admit verdict creates one audited events opportunities row in the correct Phase 4 bucket', async () => {
    installEventsFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeEventsScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({ ...fullEventsVerdict }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    const opp = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opp.status).toBe('audited');
    expect(opp.pipeline).toBe('events');
    // sys-cp-sec → Phase 4 bucket '#🔥-priority-sys-cp-sec'
    expect(opp.bucket_channel).toBe('#🔥-priority-sys-cp-sec');
    expect(opp.title).toBe('National CTF 2026');
    expect(opp.organizer).toBe('CyberSec India');
    expect(opp.audit_summary).toBe('Verified CTF infosec event, ₹1.5L cash prize, India-organized');

    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-events-1', { step_position: 'STEP_3' });
    expect(collections.tombstone_ledger.create).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('general category → Phase 4 bucket #-online-1lakh-plus', async () => {
    installEventsFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeEventsScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      ...fullEventsVerdict,
      category: 'general',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    const opp = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opp.bucket_channel).toBe('#-online-1lakh-plus');
    vi.unstubAllGlobals();
  });

  it('prize-gate false without perk_hint → prize_below_threshold tombstone, no opportunity', async () => {
    installEventsFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeEventsScratchRow()],
      existingOpportunities: [],
    });

    // Below ₹1L → prize gate false, no perk hint
    const router = makeRouter(() => ({
      ...fullEventsVerdict,
      prize_cash_inr: 50000,
      prize_text: '₹50,000 cash',
      perk_hint: null,
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = (collections.tombstone_ledger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('prize_below_threshold');
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-events-1', { step_position: 'STEP_3' });
    vi.unstubAllGlobals();
  });

  it('prize-gate false WITH perk_hint → divert to loot branch, single terminal outcome', async () => {
    installEventsFetch();
    installSuccessFetch(); // drainLootRow needs readLootRules to succeed
    const { pb, collections } = makePb({
      scratchpadRows: [makeEventsScratchRow()],
      existingOpportunities: [],
    });

    // Prize gate fails (below ₹1L) but perk_hint present → divert
    const router = makeRouter(() => ({
      ...fullEventsVerdict,
      prize_cash_inr: 50000,
      prize_text: '₹50,000 cash plus free swag',
      perk_hint: 'free swag drop for attendees',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    // Exactly one terminal outcome: either a loot opportunity OR a loot tombstone
    const oppCalls = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls.length;
    const tsCalls = (collections.tombstone_ledger.create as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(oppCalls + tsCalls).toBe(1);

    // Never an events opportunity and never a prize_below_threshold tombstone in the divert flow
    if (oppCalls > 0) {
      const opp = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(opp.pipeline).toBe('loot');
      expect(opp.bucket_channel).toBe('#🎁-free-swag-and-credits');
    } else {
      const tsCall = (collections.tombstone_ledger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(tsCall.terminal_status).not.toBe('prize_below_threshold');
    }
    vi.unstubAllGlobals();
  });

  it('link_hop_failed tombstones when resolveOfficialDomain fails', async () => {
    installHopFailureFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeEventsScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({ ...fullEventsVerdict }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = (collections.tombstone_ledger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('link_hop_failed');
    vi.unstubAllGlobals();
  });

  it('domain filter reject → tombstone with Phase 4 reason verbatim, no opportunity', async () => {
    // Domain filter rejects: low organizer/agenda scores, non-SWE domain
    installEventsFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeEventsScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      ...fullEventsVerdict,
      organizer_score: 2,
      agenda_score: 2,
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = (collections.tombstone_ledger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('non-technical');
    vi.unstubAllGlobals();
  });

  it('UNVERIFIED verdict writes nothing and leaves row at STEP_2', async () => {
    installEventsFetch();
    const { pb, collections } = makePb({
      scratchpadRows: [makeEventsScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => 'UNVERIFIED');

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).not.toHaveBeenCalled();
    expect(collections.scratchpad.update).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
