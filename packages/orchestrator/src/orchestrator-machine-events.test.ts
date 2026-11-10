// Orchestrator machine events (the Glass feed's verdict rows).
// Fake PocketBase; no network, no LLM quota.

import { describe, expect, it, vi } from 'vitest';
import { drainStep2Rows } from './orchestrator.js';
import type { TaskScratchpadRow } from '@zod/db-hot/schema';

interface MachineRow {
  id: string;
  trace_id: string;
  agent: string;
  pipeline: string;
  event_type: string;
  tool: string;
  status: string;
  step: string;
  url: string;
  detail: string;
}

function makeRow(overrides: Partial<TaskScratchpadRow> = {}): TaskScratchpadRow {
  return {
    id: 'scratch-jobs-1',
    created: '2026-10-16T08:00:00Z',
    updated: '2026-10-16T08:00:00Z',
    candidate_url: 'https://boards.greenhouse.io/acme/jobs/123',
    step_position: 'STEP_2',
    pipeline: 'jobs',
    candidate_title: 'Frontend Engineer (Fresher)',
    partial_buffer:
      'We are hiring a frontend engineer for our growing team. This is a fresher-friendly role with 0-1 years experience. Based in Bangalore, India. Stack: React, TypeScript.',
    attempts: 0,
    last_error: null,
    ...overrides,
  } as TaskScratchpadRow;
}

function makePb(rows: TaskScratchpadRow[]) {
  const machineEvents: MachineRow[] = [];
  const opportunities: Array<Record<string, unknown>> = [];
  const tombstones: Array<Record<string, unknown>> = [];

  const collections: Record<string, any> = {
    task_scratchpad: {
      getList: async (_page: number, _perPage: number, opts?: unknown) => {
        const filter = (opts as any)?.filter as string | undefined;
        let items = [...rows];
        if (filter?.includes("step_position = 'STEP_2'")) {
          items = items.filter((r) => r.step_position === 'STEP_2');
        }
        return { items, totalItems: items.length };
      },
      update: vi.fn(async () => undefined),
    },
    opportunities: {
      getList: async (_page: number, _perPage: number, opts?: unknown) => {
        const filter = (opts as any)?.filter as string | undefined;
        if (filter?.includes('url_hash')) {
          const urlHash = filter.match(/url_hash = '([^']+)'/)?.[1];
          const matched = opportunities.filter((o) => o.url_hash === urlHash);
          return { items: matched, totalItems: matched.length };
        }
        return { items: opportunities, totalItems: opportunities.length };
      },
      create: vi.fn(async (data: Record<string, unknown>) => {
        opportunities.push(data);
        return { id: `opp-${opportunities.length}` };
      }),
      update: vi.fn(async () => undefined),
    },
    tombstone_ledger: {
      create: vi.fn(async (data: Record<string, unknown>) => {
        tombstones.push(data);
        return { id: `ts-${tombstones.length}` };
      }),
      getFirstListItem: vi.fn(async () => {
        throw new Error('404 not found');
      }),
    },
    taste_rules: {
      getList: async () => ({ items: [], totalItems: 0 }),
    },
    machine_events: {
      create: vi.fn(async (data: Record<string, unknown>) => {
        machineEvents.push(data as unknown as MachineRow);
        return { id: `me-${machineEvents.length}` };
      }),
    },
  };

  const pb: any = {
    collection: (name: string) => {
      const found = collections[name];
      if (!found) throw new Error(`unknown collection: ${name}`);
      return found;
    },
  };

  return { pb, machineEvents, opportunities, tombstones };
}

function makeRouter(verdict: unknown) {
  return {
    complete: vi.fn(async () => ({ verdict, bucket: 'tier1/groq:test', path: [] })),
    allBucketsUnavailable: () => false,
  } as any;
}

const ADMITTED_VERDICT = {
  admission_class: 'admit',
  reason_code: null,
  stack_tags: ['react'],
  stated_min_years: 0,
  fellowship_program: null,
  scam_signals: [],
  geo_verdict: 'india',
  company: 'Acme',
  experience_span: '0-1 yrs',
  stack_tags_extra: [],
  eligibility_summary: 'fresher friendly',
  audit_summary: 'Fresher role in Bangalore',
};

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));
}

describe('orchestrator machine events', () => {
  it('emits process start/ok, a tombstone, and no opportunity for a rejected row', async () => {
    const { pb, machineEvents, opportunities } = makePb([makeRow()]);
    await drainStep2Rows({
      pb,
      router: makeRouter({ ...ADMITTED_VERDICT, admission_class: 'reject', reason_code: 'not_fresher' }),
    });
    await flush();

    const tools = machineEvents.map((e) => `${e.tool}:${e.status}`);
    expect(tools).toContain('orchestrator.process:start');
    expect(tools).toContain('orchestrator.tombstone:skip');
    expect(tools).toContain('orchestrator.process:ok');
    expect(opportunities).toHaveLength(0);

    const tombstone = machineEvents.find((e) => e.tool === 'orchestrator.tombstone');
    expect(tombstone?.detail).toContain('not_fresher');
    expect(tombstone?.step).toBe('STEP_3');
    expect(tombstone?.trace_id).toBeTruthy();
  });

  it('emits an opportunity event when the row is admitted', async () => {
    const { pb, machineEvents, opportunities } = makePb([makeRow()]);
    await drainStep2Rows({ pb, router: makeRouter(ADMITTED_VERDICT) });
    await flush();

    expect(opportunities).toHaveLength(1);
    const created = machineEvents.find((e) => e.tool === 'orchestrator.opportunity');
    expect(created).toBeDefined();
    expect(created?.status).toBe('ok');
    expect(created?.pipeline).toBe('jobs');
    expect(created?.detail).toContain('created jobs opportunity');
  });

  it('emits a verdict event when the LLM returns no verdict', async () => {
    const { pb, machineEvents } = makePb([makeRow()]);
    await drainStep2Rows({ pb, router: makeRouter('UNVERIFIED') });
    await flush();

    const verdict = machineEvents.find((e) => e.tool === 'orchestrator.verdict');
    expect(verdict).toBeDefined();
    expect(verdict?.status).toBe('skip');
    expect(verdict?.detail).toContain('UNVERIFIED');
  });
});
