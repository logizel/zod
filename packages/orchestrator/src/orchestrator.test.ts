// Orchestrator drainStep2Rows loot branch tests.
// Tests the loot drain branch (readLootRules → loot rule pack → router → gates →
// write/tombstone) using fakes, mirroring e2e-tracer.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainStep2Rows } from './orchestrator.js';
import type { TaskScratchpadRow } from '@zod/db-hot/schema';

vi.mock('@zod/dedup/merger', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    attemptMerge: vi.fn().mockResolvedValue({ merged: false, possibleDupe: false }),
    createMergeStore: vi.fn(() => ({
      findCandidates: vi.fn(),
      appendLinks: vi.fn(),
      tombstoneMerged: vi.fn(),
    })),
  };
});

import { attemptMerge, createMergeStore } from '@zod/dedup/merger';

const mockedAttemptMerge = attemptMerge as ReturnType<typeof vi.fn>;
const mockedCreateMergeStore = createMergeStore as ReturnType<typeof vi.fn>;

// Default: no merge, so existing tests are unaffected by the backstop stage.
beforeEach(() => {
  mockedAttemptMerge.mockResolvedValue({ merged: false, possibleDupe: false });
});

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

function makeJobsScratchRow(overrides: Partial<TaskScratchpadRow> = {}): TaskScratchpadRow {
  return {
    id: 'scratch-jobs-1',
    created: '2026-10-16T08:00:00Z',
    updated: '2026-10-16T08:00:00Z',
    candidate_url: 'https://boards.greenhouse.io/acme/jobs/123',
    step_position: 'STEP_2',
    pipeline: 'jobs',
    candidate_title: 'Frontend Engineer (Fresher)',
    partial_buffer:
      'We are hiring a frontend engineer for our growing team. This is a fresher-friendly role with 0-1 years experience. Based in Bangalore, India. Stack: React, TypeScript, Node.js.',
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
    vi.clearAllMocks();
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

// ---------------------------------------------------------------------------
// Drain limit enforcement, per-row isolation, cold-store tombstone, parse failure
// ---------------------------------------------------------------------------

describe('orchestrator drainStep2Rows — drain limit and isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls getList with bounded page size (default 25)', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [],
      existingOpportunities: [],
    });
    const getListSpy = vi.spyOn(collections.scratchpad, 'getList');

    const router = makeRouter(() => 'UNVERIFIED');

    await drainStep2Rows({ pb, router: router as any, pageSize: 25 });

    expect(getListSpy).toHaveBeenCalledWith(1, 25, expect.objectContaining({
      filter: "step_position = 'STEP_2'",
    }));
  });

  it('uses custom pageSize when provided', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [],
      existingOpportunities: [],
    });
    const getListSpy = vi.spyOn(collections.scratchpad, 'getList');

    const router = makeRouter(() => 'UNVERIFIED');

    await drainStep2Rows({ pb, router: router as any, pageSize: 10 });

    expect(getListSpy).toHaveBeenCalledWith(1, 10, expect.objectContaining({
      filter: "step_position = 'STEP_2'",
    }));
  });

  it('per-row isolation: a throwing router call does not abort the batch', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [
        makeJobsScratchRow({ id: 'scratch-1', candidate_url: 'https://example.com/job-1' }),
        makeJobsScratchRow({ id: 'scratch-2', candidate_url: 'https://example.com/job-2' }),
      ],
      existingOpportunities: [],
    });

    let callCount = 0;
    const router = makeRouter(() => {
      callCount++;
      if (callCount === 1) throw new Error('router boom');
      return {
        admission_class: 'admit',
        reason_code: null,
        stack_tags: ['React'],
        eligibility_summary: 'ok',
        audit_summary: 'ok',
      };
    });

    await drainStep2Rows({ pb, router: router as any, pageSize: 25 });

    // Router called for both rows (first threw, second succeeded)
    expect(callCount).toBe(2);
    // Second row still created an opportunity
    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    // Throwing row stays at STEP_2 (no update), succeeding row advances to STEP_3
    expect(collections.scratchpad.update).toHaveBeenCalledTimes(1);
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-2', { step_position: 'STEP_3' });
    // No tombstone for the throwing row (error is caught and logged)
    expect(collections.tombstone_ledger.create).not.toHaveBeenCalled();
  });

  it('cold-store tombstone write invoked on reject verdict', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeJobsScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      admission_class: 'reject',
      reason_code: 'scam_pay_to_join',
      stack_tags: [],
      eligibility_summary: '',
      audit_summary: 'rejected',
    }));

    await drainStep2Rows({ pb, router: router as any, pageSize: 25 });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = collections.tombstone_ledger.create.mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('scam_pay_to_join');
    expect(tsCall.source).toBe('auditor');
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-jobs-1', { step_position: 'STEP_3' });
  });

  it('opportunity parse failure: no partial row, tombstone with verdict_parse_failed', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeJobsScratchRow()],
      existingOpportunities: [],
    });

    // Verdict missing required audit_summary → zod parse failure
    const router = makeRouter(() => ({
      admission_class: 'admit',
      reason_code: null,
      stack_tags: ['React'],
      eligibility_summary: 'ok',
      // audit_summary intentionally missing → parse fails
    }));

    await drainStep2Rows({ pb, router: router as any, pageSize: 25 });

    // No opportunities row created (no partial write)
    expect(collections.opportunities.create).not.toHaveBeenCalled();
    // Tombstone written with verdict_parse_failed
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = collections.tombstone_ledger.create.mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('verdict_parse_failed');
    expect(tsCall.source).toBe('auditor');
    // Row advanced to STEP_3 (terminal decision reached)
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-jobs-1', { step_position: 'STEP_3' });
  });
});

// ---------------------------------------------------------------------------
// Drain backstop (D-10) — merge before opportunities create
// ---------------------------------------------------------------------------

describe('orchestrator drain backstop (D-10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedAttemptMerge.mockReset();
    mockedCreateMergeStore.mockReset();
  });

  it('jobs: merged at backstop → no opportunities.create, tombstone merged, STEP_3', async () => {
    mockedCreateMergeStore.mockImplementation(() => ({
      findCandidates: vi.fn().mockResolvedValue([{
        id: 'master-1', pipeline: 'jobs', title: 'Google | I/O 2026',
        url: 'https://boards.greenhouse.io/acme/jobs/1', organizer: 'Google',
        location: 'Bangalore, India', dateMs: 1_792_145_094_000 - 86400000,
        createdAtMs: 1_792_145_094_000 - 86400000, links: ['https://boards.greenhouse.io/acme/jobs/1'],
      }]),
      appendLinks: vi.fn(),
      tombstoneMerged: vi.fn(),
    }));
    mockedAttemptMerge.mockResolvedValue({
      merged: true,
      masterId: 'master-1',
      links: ['https://boards.greenhouse.io/acme/jobs/1', 'https://lever.co/acme/456'],
    });

    const { pb, collections } = makePb({
      scratchpadRows: [makeJobsScratchRow({ candidate_url: 'https://boards.greenhouse.io/acme/jobs/2' })],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      admission_class: 'admit',
      reason_code: null,
      stack_tags: ['React'],
      eligibility_summary: 'ok',
      audit_summary: 'Frontend engineer fresher role',
    }));

    await drainStep2Rows({ pb, router: router as any, pageSize: 25 });

    // No opportunities.create — merged at drain
    expect(collections.opportunities.create).not.toHaveBeenCalled();
    // Tombstone written via pb
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = collections.tombstone_ledger.create.mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('merged');
    expect(tsCall.source).toBe('merger');
    // Row advanced to STEP_3
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-jobs-1', { step_position: 'STEP_3' });
  });

  it('jobs: possibleDupe at backstop → possible_dupe_of written on create', async () => {
    mockedCreateMergeStore.mockImplementation(() => ({
      findCandidates: vi.fn().mockResolvedValue([{
        id: 'master-2', pipeline: 'jobs', title: 'Google IO 2026',
        url: 'https://boards.greenhouse.io/acme/jobs/2', organizer: 'Google',
        location: 'Bangalore, India', dateMs: 1_792_145_094_000 - 86400000,
        createdAtMs: 1_792_145_094_000 - 86400000, links: ['https://boards.greenhouse.io/acme/jobs/2'],
      }]),
      appendLinks: vi.fn(),
      tombstoneMerged: vi.fn(),
    }));
    mockedAttemptMerge.mockResolvedValue({
      merged: false,
      possibleDupe: true,
      masterId: 'master-2',
    });

    const { pb, collections } = makePb({
      scratchpadRows: [makeJobsScratchRow({ candidate_url: 'https://boards.greenhouse.io/acme/jobs/3' })],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      admission_class: 'admit',
      reason_code: null,
      stack_tags: ['React'],
      eligibility_summary: 'ok',
      audit_summary: 'Frontend engineer fresher role',
    }));

    await drainStep2Rows({ pb, router: router as any, pageSize: 25 });

    // opportunities.create called with possible_dupe_of
    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    const createCall = collections.opportunities.create.mock.calls[0][0];
    expect(createCall.possible_dupe_of).toBe('master-2');
    // Row advanced to STEP_3
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-jobs-1', { step_position: 'STEP_3' });
  });
});

// ---------------------------------------------------------------------------
// Local scratch row helper
// ---------------------------------------------------------------------------

function makeLocalScratchRow(overrides: Partial<TaskScratchpadRow> = {}): TaskScratchpadRow {
  return {
    id: 'scratch-local-1',
    created: '2026-10-16T08:00:00Z',
    updated: '2026-10-16T08:00:00Z',
    candidate_url: 'https://nitk.edu.in/event/hackathon-2026',
    step_position: 'STEP_2',
    pipeline: 'local',
    candidate_title: 'NITK Hackathon 2026',
    partial_buffer: '',
    attempts: 0,
    last_error: null,
    ...overrides,
  } as TaskScratchpadRow;
}

// ---------------------------------------------------------------------------
// Local pipeline tests
// ---------------------------------------------------------------------------

describe('orchestrator drainStep2Rows local branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('DK/Udupi offline event routes to #📍-local-dk-udupi regardless of prize size', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeLocalScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      title: 'NITK Hackathon 2026',
      organizer: 'NITK Surathkal',
      location: 'Surathkal, DK',
      isOffline: true,
      hasSelectionRound: false,
      category: 'general',
      prize_cash_inr: 50000,
      prize_text: '₹50,000 cash',
      perk_hint: null,
      dates: null,
      audit_summary: 'Local hackathon at NITK DK, below ₹1L prize',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    const opp = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opp.status).toBe('audited');
    expect(opp.pipeline).toBe('local');
    expect(opp.bucket_channel).toBe('#📍-local-dk-udupi');
    expect(opp.deadlines.tba).toBe(true);
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-local-1', { step_position: 'STEP_3' });
    expect(collections.tombstone_ledger.create).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('DK/Udupi offline event with high prize still routes to #📍-local-dk-udupi (prize gate bypassed)', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeLocalScratchRow({ candidate_url: 'https://nitk.edu.in/event/ctf-2026' })],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      title: 'NITK CTF 2026',
      organizer: 'NITK Surathkal',
      location: 'DK',
      isOffline: true,
      hasSelectionRound: false,
      category: 'sys-cp-sec',
      prize_cash_inr: 500000,
      prize_text: '₹5,00,000 cash',
      perk_hint: null,
      dates: { start: '2026-12-15T09:00:00Z', end: '2026-12-16T18:00:00Z' },
      audit_summary: 'NITK CTF, ₹5L cash prize, DK-local',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    const opp = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opp.bucket_channel).toBe('#📍-local-dk-udupi');
    expect(opp.deadlines.tba).toBe(false);
    vi.unstubAllGlobals();
  });

  it('Udupi offline event routes to #📍-local-dk-udupi (case-insensitive location match)', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeLocalScratchRow({ candidate_url: 'https://manipal.edu.in/event/fest-2026' })],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      title: 'Manipal Fest 2026',
      organizer: 'MIT Manipal',
      location: 'Udupi, Karnataka',
      isOffline: true,
      hasSelectionRound: false,
      category: 'general',
      prize_cash_inr: null,
      prize_text: 'TBA',
      perk_hint: null,
      dates: null,
      audit_summary: 'Manipal fest, Udupi, TBA prize',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    const opp = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opp.bucket_channel).toBe('#📍-local-dk-udupi');
    vi.unstubAllGlobals();
  });

  it('out-of-town offline with selection round routes to #✈️-travel-curated', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeLocalScratchRow({ candidate_url: 'https://iitbombay.edu.in/event/hackathon-2026' })],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      title: 'IIT Bombay Hackathon',
      organizer: 'IIT Bombay',
      location: 'Mumbai',
      isOffline: true,
      hasSelectionRound: true,
      category: 'general',
      prize_cash_inr: null,
      prize_text: 'TBA',
      perk_hint: null,
      dates: null,
      audit_summary: 'IIT Bombay hackathon, selection round, travel-curated',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    const opp = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opp.bucket_channel).toBe('#✈️-travel-curated');
    expect(opp.pipeline).toBe('local');
    vi.unstubAllGlobals();
  });

  it('out-of-town offline without selection round → tombstone walk_in_rejected', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeLocalScratchRow({ candidate_url: 'https://bangalore.edu.in/event/workshop-2026' })],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      title: 'Bangalore Workshop',
      organizer: 'Some College',
      location: 'Bangalore',
      isOffline: true,
      hasSelectionRound: false,
      category: 'general',
      prize_cash_inr: null,
      prize_text: 'TBA',
      perk_hint: null,
      dates: null,
      audit_summary: 'Bangalore workshop, walk-in, no selection round',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = (collections.tombstone_ledger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('walk_in_rejected');
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-local-1', { step_position: 'STEP_3' });
    vi.unstubAllGlobals();
  });

  it('online event with prize gate pass → routes to category bucket', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeLocalScratchRow({ candidate_url: 'https://example.com/event/online-ctf-2026' })],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      title: 'Online CTF 2026',
      organizer: 'CyberSec India',
      location: 'Online',
      isOffline: false,
      hasSelectionRound: false,
      category: 'sys-cp-sec',
      prize_cash_inr: 150000,
      prize_text: '₹1,50,000 cash',
      perk_hint: null,
      dates: { start: '2026-12-15T09:00:00Z', end: '2026-12-16T18:00:00Z' },
      audit_summary: 'Online CTF, ₹1.5L cash prize',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    const opp = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opp.bucket_channel).toBe('#🔥-priority-sys-cp-sec');
    expect(opp.pipeline).toBe('local');
    vi.unstubAllGlobals();
  });

  it('online event with prize gate fail → tombstone prize_below_threshold', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeLocalScratchRow({ candidate_url: 'https://example.com/event/online-meetup-2026' })],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      title: 'Online Meetup',
      organizer: 'Some Org',
      location: 'Online',
      isOffline: false,
      hasSelectionRound: false,
      category: 'general',
      prize_cash_inr: 50000,
      prize_text: '₹50,000 cash',
      perk_hint: null,
      dates: null,
      audit_summary: 'Online meetup, below ₹1L',
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
    vi.unstubAllGlobals();
  });

  it('UNVERIFIED verdict writes nothing and leaves row at STEP_2', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeLocalScratchRow()],
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

  it('verdict parse failure → tombstone verdict_parse_failed', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeLocalScratchRow()],
      existingOpportunities: [],
    });

    // Missing required location field → zod parse failure
    const router = makeRouter(() => ({
      title: 'Test',
      organizer: 'Org',
      // location missing → parse fails
      isOffline: true,
      hasSelectionRound: false,
      prize_cash_inr: null,
      prize_text: 'TBA',
      dates: null,
      audit_summary: 'Test',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = (collections.tombstone_ledger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('verdict_parse_failed');
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-local-1', { step_position: 'STEP_3' });
    vi.unstubAllGlobals();
  });
});
