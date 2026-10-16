// Cross-pipeline drain gate: one mixed STEP_2 batch → exact terminal ledger.
//
// Seeds 6 STEP_2 rows across events/jobs/loot pipelines in a single drain pass
// and asserts the exact terminal state: 4 opportunities + 2 tombstones, every
// row at STEP_3, single master per merge-group under the same-batch race, and
// per-row isolation when a router call throws.
//
// Zero production code changes — exercises drainStep2Rows with fake PB, fake
// router, and mocked fetch only. No network, no real PB/Turso.
//
// Race semantics (documented): a same-window duplicate may consume a second
// audit attempt but yields exactly ONE master — the invariant this test pins.
//
// Roadmap Phase 5 success criteria asserted: 1 (jobs channel), 3 (stack
// routing), 4 (loot divert + US-only reject), 5 (single merged alert).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainStep2Rows } from './orchestrator.js';
import type { TaskScratchpadRow } from '@zod/db-hot/schema';

// ---------------------------------------------------------------------------
// URLs for the 6 seeded rows
// ---------------------------------------------------------------------------

const EVENTS_URL_1 = 'https://devpost.com/event/national-ctf-2026';
const EVENTS_URL_5 = 'https://devpost.com/event/college-fest-2026';
const EVENTS_URL_6 = 'https://luma.com/event/national-ctf-2026'; // same-batch dup of row 1
const JOBS_URL_2 = 'https://boards.greenhouse.io/acme/jobs/123';
const JOBS_URL_3 = 'https://jobs.lever.co/acme/456';
const LOOT_URL_4 = 'https://aws.amazon.com/credits/startup';

// ---------------------------------------------------------------------------
// Fakes (same shape as e2e-tracer.test.ts / orchestrator.test.ts)
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
}): { pb: any; collections: FakeCollections; opportunities: unknown[] } {
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
        opportunities.push({
          id: `opp-${opportunities.length + 1}`,
          created_at: new Date().toISOString(),
          ...data,
        });
        return { id: `opp-${opportunities.length}` };
      }),
      getList: async (_page: number, _perPage: number, opts?: unknown) => {
        const filter = (opts as any)?.filter as string | undefined;
        let items = opportunities;
        if (filter) {
          if (filter.includes('url_hash')) {
            const urlHash = filter.match(/url_hash = '([^']+)'/)?.[1];
            items = items.filter((o: any) => o.url_hash === urlHash);
          }
          if (filter.includes('pipeline =')) {
            const match = filter.match(/pipeline = '([^']+)'/);
            if (match) {
              items = items.filter((o: any) => o.pipeline === match[1]);
            }
          }
        }
        return { items, totalItems: items.length };
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
  return { pb, collections, opportunities };
}

function makeRouter(verdictFn: (opts: any) => unknown) {
  return {
    complete: vi.fn(async (opts: unknown) => ({ verdict: verdictFn(opts as any), bucket: 'tier1/groq:test', path: [], reason: undefined })),
  };
}

function makeScratchRow(overrides: Partial<TaskScratchpadRow> = {}): TaskScratchpadRow {
  return {
    id: 'scratch-1',
    created: '2026-10-16T08:00:00Z',
    updated: '2026-10-16T08:00:00Z',
    candidate_url: 'https://example.com/row-1',
    step_position: 'STEP_2',
    pipeline: 'events',
    candidate_title: 'Default',
    partial_buffer: 'default text',
    attempts: 0,
    last_error: null,
    ...overrides,
  } as TaskScratchpadRow;
}

// ---------------------------------------------------------------------------
// Fetch mock: resolveOfficialDomain (events) + readLootRules (loot) both
// use globalThis.fetch. 2-hop redirect chain → official domain, then 200.
// Jina responses must be ≥500 chars (fetchViaJina short-body guard).
// ---------------------------------------------------------------------------

function installFetch(): void {
  const mockFetch = vi.fn();
  mockFetch.mockImplementation(async (input: any) => {
    const url = String(input);
    // Jina reader (sanitize facade) — returns text for loot FAQ fetch.
    // Body must be ≥500 chars to pass fetchViaJina's short-body guard.
    if (url.startsWith('https://r.jina.ai/')) {
      const longText = 'official rules text '.repeat(60); // ~1080 chars
      return new Response(longText, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    // Redirect chain: candidate → 302 → intermediate → 302 → official → 200
    if (url === EVENTS_URL_1 || url === EVENTS_URL_5 || url === EVENTS_URL_6 || url === LOOT_URL_4) {
      return new Response(null, { status: 302, headers: { location: 'https://intermediate.example.com/page' } });
    }
    if (url === 'https://intermediate.example.com/page') {
      return new Response(null, { status: 302, headers: { location: 'https://official.example.com/page' } });
    }
    if (url === 'https://official.example.com/page') {
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal('fetch', mockFetch);
}

// ---------------------------------------------------------------------------
// Merger mock: attemptMerge returns merged for EVENTS_URL_6 (same-batch dup
// of row 1), not merged for everything else. Simulates link union on master.
// ---------------------------------------------------------------------------

vi.mock('@zod/dedup/merger', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    attemptMerge: vi.fn(),
    createMergeStore: vi.fn(),
  };
});

import { attemptMerge, createMergeStore } from '@zod/dedup/merger';
const mockedAttemptMerge = attemptMerge as ReturnType<typeof vi.fn>;
const mockedCreateMergeStore = createMergeStore as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cross-pipeline drain: mixed batch, exact terminal ledger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockedAttemptMerge.mockReset();
    mockedCreateMergeStore.mockReset();

    // Default: no merge for any row.
    mockedAttemptMerge.mockResolvedValue({ merged: false, possibleDupe: false });

    mockedCreateMergeStore.mockImplementation(() => ({
      findCandidates: vi.fn().mockResolvedValue([]),
      appendLinks: vi.fn(),
      tombstoneMerged: vi.fn(),
    }));
  });

  it('single mixed pass: 4 opportunities + 2 tombstones, all STEP_3, single master', async () => {
    installFetch();

    const { pb, collections } = makePb({
      scratchpadRows: [
        // Row 1: events admit, sys-cp-sec, prize ≥ ₹1L → events opportunity
        makeScratchRow({
          id: 'scratch-events-1',
          candidate_url: EVENTS_URL_1,
          pipeline: 'events',
          candidate_title: 'National CTF 2026',
          partial_buffer: 'National CTF 2026 — cybersecurity capture the flag, ₹1,50,000 cash prize, organized by CyberSec India.',
        }),
        // Row 2: jobs admit, sys/cloud stack → sys-cloud bucket opportunity
        makeScratchRow({
          id: 'scratch-jobs-2',
          candidate_url: JOBS_URL_2,
          pipeline: 'jobs',
          candidate_title: 'Frontend Engineer (Fresher)',
          partial_buffer: 'We are hiring a frontend engineer. Fresher-friendly, 0-1 years experience. Bangalore, India. Stack: React, TypeScript, Node.js, cloud.',
        }),
        // Row 3: jobs admit, general stack → general bucket opportunity
        makeScratchRow({
          id: 'scratch-jobs-3',
          candidate_url: JOBS_URL_3,
          pipeline: 'jobs',
          candidate_title: 'Backend Engineer',
          partial_buffer: 'Backend engineer role, fresher welcome. Remote India. Stack: React.',
        }),
        // Row 4: loot admit, India shipping → loot opportunity
        makeScratchRow({
          id: 'scratch-loot-4',
          candidate_url: LOOT_URL_4,
          pipeline: 'loot',
          candidate_title: 'CKA Exam Voucher',
          partial_buffer: '',
        }),
        // Row 5: events prize-fail + perk_hint → divert to loot → US-only → tombstone loot_us_eu_only
        makeScratchRow({
          id: 'scratch-events-5',
          candidate_url: EVENTS_URL_5,
          pipeline: 'events',
          candidate_title: 'College Fest 2026',
          partial_buffer: 'College fest with free swag perk, systems event, below ₹1L.',
        }),
        // Row 6: same-batch events duplicate of row 1 → merged tombstone, no second opportunity
        makeScratchRow({
          id: 'scratch-events-6',
          candidate_url: EVENTS_URL_6,
          pipeline: 'events',
          candidate_title: 'National CTF 2026',
          partial_buffer: 'National CTF 2026 — cybersecurity capture the flag, ₹1,50,000 cash prize, organized by CyberSec India.',
        }),
      ],
      existingOpportunities: [],
    });

    // Override attemptMerge for this test: EVENTS_URL_6 merges into row 1's master.
    mockedAttemptMerge.mockImplementation(async (input: any, store: any) => {
      if (input.url === EVENTS_URL_6) {
        const allLinks = [EVENTS_URL_1, EVENTS_URL_6];
        const master = collections.opportunities.__created__[0];
        if (master) master.registration_links = allLinks;
        await store.appendLinks(master?.id ?? 'master-events-1', allLinks);
        return { merged: true, masterId: master?.id ?? 'master-events-1', links: allLinks };
      }
      return { merged: false, possibleDupe: false };
    });

    const router = makeRouter((opts: any) => {
      const { pipeline, url } = opts;

      // Events verdicts
      if (pipeline === 'events') {
        if (url === EVENTS_URL_1 || url === EVENTS_URL_6) {
          return {
            admission_class: 'admit',
            reason_code: null,
            category: 'sys-cp-sec',
            prize_cash_inr: 150000,
            prize_text: '₹1,50,000 cash',
            organizer: 'CyberSec India',
            organizer_score: 9,
            agenda_score: 9,
            dates: { start: '2026-12-15T09:00:00Z', end: '2026-12-16T18:00:00Z' },
            audit_summary: 'Verified CTF infosec event, ₹1.5L cash prize, India-organized',
            perk_hint: null,
            title: 'National CTF 2026',
          };
        }
        if (url === EVENTS_URL_5) {
          return {
            admission_class: 'admit',
            reason_code: null,
            category: 'general',
            prize_cash_inr: 50000,
            prize_text: '₹50,000 cash plus free swag',
            organizer: 'FestCo',
            organizer_score: 9,
            agenda_score: 9,
            dates: null,
            audit_summary: 'College fest with swag perk, systems event, below ₹1L',
            perk_hint: 'free swag drop for attendees',
            title: 'College Fest 2026',
          };
        }
      }

      // Jobs verdicts
      if (pipeline === 'jobs') {
        if (url === JOBS_URL_2) {
          return {
            admission_class: 'admit',
            reason_code: null,
            stated_min_years: null,
            experience_span: '0-1 years',
            fellowship_program: null,
            stack_tags: ['React', 'TypeScript', 'Node.js', 'cloud'],
            scam_signals: [],
            geo_verdict: null,
            eligibility_summary: 'Fresher-friendly, India-eligible',
            audit_summary: 'Verified fresher frontend role, India-based',
          };
        }
        if (url === JOBS_URL_3) {
          return {
            admission_class: 'admit',
            reason_code: null,
            stated_min_years: null,
            experience_span: '0-1 years',
            fellowship_program: null,
            stack_tags: ['React'],
            scam_signals: [],
            geo_verdict: null,
            eligibility_summary: 'Fresher-friendly',
            audit_summary: 'Verified fresher backend role',
          };
        }
      }

      // Loot verdicts (direct loot row 4 + diverted events row 5)
      if (pipeline === 'loot') {
        if (url === LOOT_URL_4) {
          return {
            perk: 'Free CKA exam voucher',
            perk_description: 'Certified Kubernetes Administrator exam voucher',
            shipping_verified: true,
            shipping_region: 'india',
            shipping_quote: 'Ships to India at no cost',
            card_required: false,
            offer_cost: 'free',
            claim_steps: [{ step: 'Register at the portal', quote: 'Register at the CNCF training portal' }],
            audit_summary: 'Free CKA voucher, India shipping, no card',
          };
        }
        if (url === EVENTS_URL_5) {
          // Diverted loot: US-only shipping → rejected by loot gate
          return {
            perk: 'Free swag drop',
            perk_description: 'Free conference swag for attendees',
            shipping_verified: true,
            shipping_region: 'us',
            shipping_quote: 'Ships to US addresses only',
            card_required: false,
            offer_cost: 'free',
            claim_steps: [{ step: 'Claim at the booth', quote: 'Claim your swag at the registration booth' }],
            audit_summary: 'Free swag, US-only shipping',
          };
        }
      }

      return 'UNVERIFIED';
    });

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    // -----------------------------------------------------------------------
    // Exact ledger: 4 opportunities, 2 tombstones
    // -----------------------------------------------------------------------
    expect(collections.opportunities.create).toHaveBeenCalledTimes(4);
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(2);

    // Tombstone reasons verbatim
    const tsCalls = collections.tombstone_ledger.create.mock.calls;
    const terminalStatuses = tsCalls.map((c: any[]) => c[0].terminal_status);
    expect(terminalStatuses).toContain('loot_us_eu_only');
    expect(terminalStatuses).toContain('merged');

    // loot_us_eu_only tombstone source = 'auditor'
    const lootTs = tsCalls.find((c: any[]) => c[0].terminal_status === 'loot_us_eu_only');
    expect(lootTs[0].source).toBe('auditor');

    // merged tombstone source = 'merger'
    const mergedTs = tsCalls.find((c: any[]) => c[0].terminal_status === 'merged');
    expect(mergedTs[0].source).toBe('merger');

    // -----------------------------------------------------------------------
    // Per-pipeline opportunity assertions (explicit values, no snapshots)
    // -----------------------------------------------------------------------
    const oppCalls = collections.opportunities.create.mock.calls;

    // Opp 1: events sys-cp-sec → '#🔥-priority-sys-cp-sec'
    const opp1 = oppCalls[0][0];
    expect(opp1.pipeline).toBe('events');
    expect(opp1.status).toBe('audited');
    expect(opp1.bucket_channel).toBe('#🔥-priority-sys-cp-sec');
    expect(opp1.title).toBe('National CTF 2026');
    expect(opp1.organizer).toBe('CyberSec India');

    // Opp 2: jobs sys/cloud stack → '#⚙️-jobs-sys-cloud-devops'
    const opp2 = oppCalls[1][0];
    expect(opp2.pipeline).toBe('jobs');
    expect(opp2.status).toBe('audited');
    expect(opp2.bucket_channel).toBe('#⚙️-jobs-sys-cloud-devops');
    expect(opp2.title).toBe('Frontend Engineer (Fresher)');

    // Opp 3: jobs general stack → '#💼-jobs-general-swe'
    const opp3 = oppCalls[2][0];
    expect(opp3.pipeline).toBe('jobs');
    expect(opp3.status).toBe('audited');
    expect(opp3.bucket_channel).toBe('#💼-jobs-general-swe');
    expect(opp3.title).toBe('Backend Engineer');

    // Opp 4: loot → '#🎁-free-swag-and-credits' with D-14 loot fields
    const opp4 = oppCalls[3][0];
    expect(opp4.pipeline).toBe('loot');
    expect(opp4.status).toBe('audited');
    expect(opp4.bucket_channel).toBe('#🎁-free-swag-and-credits');
    expect(opp4.shipping_verified).toBe(true);
    expect(opp4.card_required).toBe(false);
    expect(opp4.claim_steps).toEqual([
      { step: 'Register at the portal', quote: 'Register at the CNCF training portal' },
    ]);

    // -----------------------------------------------------------------------
    // Single-master merge: row 1 master has both URLs deduplicated
    // -----------------------------------------------------------------------
    // registration_links is set on the stored copy (__created__), not the
    // original create() data object (create shallow-spreads data).
    const masterStored = collections.opportunities.__created__[0];
    expect(masterStored.registration_links).toEqual([EVENTS_URL_1, EVENTS_URL_6]);

    // No second events opportunity (only opp 1 is events)
    const eventsOpps = oppCalls.filter((c: any[]) => c[0].pipeline === 'events');
    expect(eventsOpps.length).toBe(1);

    // -----------------------------------------------------------------------
    // All 6 rows advanced to STEP_3
    // -----------------------------------------------------------------------
    const updateCalls = collections.scratchpad.update.mock.calls;
    const step3Calls = updateCalls.filter((c: any[]) => c[1]?.step_position === 'STEP_3');
    expect(step3Calls.length).toBe(6);
    const updatedIds = step3Calls.map((c: any[]) => c[0]).sort();
    expect(updatedIds).toEqual([
      'scratch-events-1',
      'scratch-events-5',
      'scratch-events-6',
      'scratch-jobs-2',
      'scratch-jobs-3',
      'scratch-loot-4',
    ].sort());
  });

  it('per-row isolation: throwing router does not abort the batch', async () => {
    installFetch();

    const { pb, collections } = makePb({
      scratchpadRows: [
        makeScratchRow({
          id: 'scratch-ok-1',
          candidate_url: 'https://example.com/job-ok-1',
          pipeline: 'jobs',
          candidate_title: 'Frontend Engineer',
          partial_buffer: 'Fresher frontend role, React, Bangalore, India.',
        }),
        makeScratchRow({
          id: 'scratch-throw-2',
          candidate_url: 'https://example.com/job-throw-2',
          pipeline: 'jobs',
          candidate_title: 'Throws Row',
          partial_buffer: 'this row throws',
        }),
        makeScratchRow({
          id: 'scratch-ok-3',
          candidate_url: 'https://example.com/job-ok-3',
          pipeline: 'jobs',
          candidate_title: 'Backend Engineer',
          partial_buffer: 'Fresher backend role, Node.js, Remote India.',
        }),
      ],
      existingOpportunities: [],
    });

    let callCount = 0;
    const router = makeRouter((_opts: any) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('router boom');
      }
      return {
        admission_class: 'admit',
        reason_code: null,
        stated_min_years: null,
        experience_span: '0-1 years',
        fellowship_program: null,
        stack_tags: ['React'],
        scam_signals: [],
        geo_verdict: null,
        eligibility_summary: 'ok',
        audit_summary: 'ok',
      };
    });

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    // Router called for all 3 rows (first and third succeeded, second threw)
    expect(callCount).toBe(3);

    // Two valid rows created opportunities
    expect(collections.opportunities.create).toHaveBeenCalledTimes(2);

    // Throwing row: no partial write — no create, no tombstone, no STEP_3 update
    const throwUpdate = collections.scratchpad.update.mock.calls.find(
      (c: any[]) => c[0] === 'scratch-throw-2',
    );
    expect(throwUpdate).toBeUndefined();

    // Valid rows advanced to STEP_3
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-ok-1', { step_position: 'STEP_3' });
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-ok-3', { step_position: 'STEP_3' });
    expect(collections.scratchpad.update).toHaveBeenCalledTimes(2);

    // No tombstone for the throwing row
    expect(collections.tombstone_ledger.create).not.toHaveBeenCalled();
  });
});
