// E2E tracer test: one STEP_2 jobs row → fake router → drain → opportunities
// row (status audited + bucket_channel) / tombstone (reject path).
//
// This is the tracer proof that the missing middle is closed: production code
// assembles auditor prompts, calls LlmRouter.complete(), and writes audited
// opportunities rows against the D-14-extended schemas.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainStep2Rows } from './orchestrator.js';
import type { TaskScratchpadRow } from '@zod/db-hot/schema';

// ---------------------------------------------------------------------------
// Fakes
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

function makeScratchRow(overrides: Partial<TaskScratchpadRow> = {}): TaskScratchpadRow {
  return {
    id: 'scratch-1',
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('orchestrator drainStep2Rows (e2e tracer)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('admit verdict creates one audited opportunities row with bucket_channel and advances to STEP_3', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      admission_class: 'admit',
      reason_code: null,
      experience_span: '0-1 years',
      stack_tags: ['React', 'TypeScript'],
      eligibility_summary: 'Fresher-friendly, India-eligible',
      audit_summary: 'Verified fresher frontend role, India-based',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    // Exactly one opportunities row created
    expect(collections.opportunities.create).toHaveBeenCalledTimes(1);
    const opp = (collections.opportunities.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opp.status).toBe('audited');
    expect(opp.bucket_channel).toBe('#💼-jobs-general-swe');
    expect(opp.pipeline).toBe('jobs');
    expect(opp.experience_span).toBe('0-1 years');
    expect(opp.stack_tags).toEqual(['React', 'TypeScript']);
    expect(opp.eligibility_summary).toBe('Fresher-friendly, India-eligible');
    expect(opp.audit_summary).toBe('Verified fresher frontend role, India-based');

    // Row advanced to STEP_3
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-1', { step_position: 'STEP_3' });

    // No tombstone written
    expect(collections.tombstone_ledger.create).not.toHaveBeenCalled();
  });

  it('reject verdict writes tombstone, no opportunities row, advances to STEP_3', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => ({
      admission_class: 'reject',
      reason_code: 'scam_pay_to_join',
      experience_span: null,
      stack_tags: [],
      eligibility_summary: '',
      audit_summary: 'Rejected: pay-to-join scam detected',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    // No opportunities row created
    expect(collections.opportunities.create).not.toHaveBeenCalled();

    // Tombstone written with reason code
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = (collections.tombstone_ledger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('scam_pay_to_join');
    expect(tsCall.source).toBe('auditor');

    // Row advanced to STEP_3
    expect(collections.scratchpad.update).toHaveBeenCalledWith('scratch-1', { step_position: 'STEP_3' });
  });

  it('UNVERIFIED verdict writes nothing and leaves row at STEP_2', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeScratchRow()],
      existingOpportunities: [],
    });

    const router = makeRouter(() => 'UNVERIFIED');

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    // Nothing written
    expect(collections.opportunities.create).not.toHaveBeenCalled();
    expect(collections.tombstone_ledger.create).not.toHaveBeenCalled();

    // Row NOT advanced (update not called)
    expect(collections.scratchpad.update).not.toHaveBeenCalled();
  });

  it('POOL_SATURATED verdict writes nothing and leaves row at STEP_2', async () => {
    const { pb, collections } = makePb({
      scratchpadRows: [makeScratchRow()],
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
  });

  it('re-drain against same url_hash creates no second opportunities row', async () => {
    const existingOpp = {
      id: 'opp-existing',
      url_hash: '3682592ef7498cb9987654e0e7b2bbb43f397d96ca5fd5022e396f07b78f8167',
      status: 'audited',
      pipeline: 'jobs',
    };
    const { pb, collections } = makePb({
      scratchpadRows: [makeScratchRow({ candidate_url: 'https://boards.greenhouse.io/acme/jobs/123' })],
      existingOpportunities: [existingOpp],
    });

    const router = makeRouter(() => ({
      admission_class: 'admit',
      reason_code: null,
      experience_span: '0-1 years',
      stack_tags: ['React'],
      eligibility_summary: 'Fresher-friendly',
      audit_summary: 'Verified',
    }));

    await drainStep2Rows({
      pb,
      router: router as any,
      pageSize: 25,
    });

    // No new opportunities row (idempotent pre-check found existing)
    expect(collections.opportunities.create).not.toHaveBeenCalled();
  });
});
