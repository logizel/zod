// Telemetry tests — agent_telemetry row status transitions READY → 60s-COOLDOWN → READY.
// writeBucketState upserts; readBucketState returns latest; bucketStatusHistory captures transitions.
import { describe, expect, it } from 'vitest';
import { writeBucketState, readBucketState, bucketStatusHistory, type BucketStateInput } from './telemetry.js';

function makePb(): any {
  const rows: Record<string, any> = {};
  let counter = 0;
  let timeCounter = 0;
  const now = () => new Date(Date.now() + timeCounter++ * 1000).toISOString();
  return {
    collection: () => ({
      getFirstListItem: async (filter: string, options?: unknown) => {
        const candidates = Object.values(rows).filter((r: any) => {
          // naive filter match: provider='X' && model='Y' && step='Z'
          const parts = filter.split(' && ');
          return parts.every((part) => {
            const [k, v] = part.split(' = ');
            const val = v.replace(/^'|'$/g, '').replace(/''/g, "'");
            return r[k] === val;
          });
        });
        if (candidates.length === 0) {
          const err: any = new Error('not found');
          err.status = 404;
          throw err;
        }
        // sort by -updated if requested
        const sorted = [...candidates].sort((a: any, b: any) =>
          b.updated.localeCompare(a.updated),
        );
        const opt = options as { sort?: string } | undefined;
        const list = opt?.sort === '-updated' ? sorted : candidates;
        return list[0];
      },
      getList: async (_page: number, _perPage: number, options?: unknown) => {
        const opt = options as { filter?: string; sort?: string } | undefined;
        let candidates = Object.values(rows);
        if (opt?.filter) {
          const parts = opt.filter.split(' && ');
          candidates = candidates.filter((r: any) =>
            parts.every((part) => {
              const [k, v] = part.split(' = ');
              const val = v.replace(/^'|'$/g, '').replace(/''/g, "'");
              return r[k] === val;
            }),
          );
        }
        if (opt?.sort === '-updated') {
          candidates = [...candidates].sort((a: any, b: any) =>
            b.updated.localeCompare(a.updated),
          );
        }
        return { items: candidates, totalItems: candidates.length };
      },
      create: async (data: Record<string, unknown>) => {
        const row = {
          id: `t${++counter}`,
          created: now(),
          updated: now(),
          ...data,
        };
        rows[row.id] = row;
        return row;
      },
      update: async (id: string, data: Record<string, unknown>) => {
        const row = rows[id];
        if (!row) {
          const err: any = new Error('not found');
          err.status = 404;
          throw err;
        }
        Object.assign(row, data, { updated: now() });
        return row;
      },
    }),
  };
}

const baseInput: BucketStateInput = {
  slot: 'auditor-events-1',
  provider: 'groq',
  model: 'llama-3.1-8b-instant',
  step: 'events-audit',
  url: 'https://unstop.com/event/123',
  status: 'active',
  detail: 'bucket READY',
};

describe('writeBucketState', () => {
  it('creates a row on first write (READY → active)', async () => {
    const pb = makePb();
    await writeBucketState(pb, baseInput);
    const latest = await readBucketState(pb, 'groq', 'llama-3.1-8b-instant');
    expect(latest).toBe('active');
  });

  it('upserts: second write updates the same row (active → cooldown)', async () => {
    const pb = makePb();
    await writeBucketState(pb, baseInput);
    await writeBucketState(pb, { ...baseInput, status: 'cooldown', detail: 'bucket 60s-COOLDOWN' });
    const latest = await readBucketState(pb, 'groq', 'llama-3.1-8b-instant');
    expect(latest).toBe('cooldown');
  });

  it('upserts: third write updates the same row (cooldown → done/READY)', async () => {
    const pb = makePb();
    await writeBucketState(pb, baseInput);
    await writeBucketState(pb, { ...baseInput, status: 'cooldown', detail: 'cooling' });
    await writeBucketState(pb, { ...baseInput, status: 'done', detail: 'bucket READY again' });
    const latest = await readBucketState(pb, 'groq', 'llama-3.1-8b-instant');
    expect(latest).toBe('done');
  });

  it('READY → 60s-COOLDOWN → READY transitions are observable via readBucketState', async () => {
    const pb = makePb();
    // Write 1: READY (active)
    await writeBucketState(pb, { ...baseInput, status: 'active', detail: 'READY' });
    expect(await readBucketState(pb, 'groq', 'llama-3.1-8b-instant')).toBe('active');
    // Write 2: 60s-COOLDOWN (cooldown) — upserts same row
    await writeBucketState(pb, { ...baseInput, status: 'cooldown', detail: '60s-COOLDOWN' });
    expect(await readBucketState(pb, 'groq', 'llama-3.1-8b-instant')).toBe('cooldown');
    // Write 3: READY (done) — upserts same row
    await writeBucketState(pb, { ...baseInput, status: 'done', detail: 'READY' });
    expect(await readBucketState(pb, 'groq', 'llama-3.1-8b-instant')).toBe('done');

    // bucketStatusHistory returns the current row (latest state)
    const history = await bucketStatusHistory(pb, 'groq', 'llama-3.1-8b-instant');
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].status).toBe('done');
    expect(history[0].detail).toBe('READY');
  });
});

describe('readBucketState', () => {
  it('returns null when no row exists for the bucket', async () => {
    const pb = makePb();
    const latest = await readBucketState(pb, 'nonexistent', 'model-x');
    expect(latest).toBeNull();
  });

  it('returns the latest status across multiple writes', async () => {
    const pb = makePb();
    await writeBucketState(pb, { ...baseInput, status: 'active' });
    await writeBucketState(pb, { ...baseInput, status: 'error', detail: 'fail' });
    expect(await readBucketState(pb, 'groq', 'llama-3.1-8b-instant')).toBe('error');
  });
});

describe('bucketStatusHistory', () => {
  it('returns empty array when no rows exist', async () => {
    const pb = makePb();
    const history = await bucketStatusHistory(pb, 'groq', 'llama-3.1-8b-instant');
    expect(history).toEqual([]);
  });

  it('orders most recent first', async () => {
    const pb = makePb();
    // Different steps → different rows, so history returns multiple entries
    await writeBucketState(pb, { ...baseInput, step: 'events-audit-1', status: 'active', detail: 'first' });
    await writeBucketState(pb, { ...baseInput, step: 'events-audit-2', status: 'cooldown', detail: 'second' });
    const history = await bucketStatusHistory(pb, 'groq', 'llama-3.1-8b-instant');
    expect(history.length).toBe(2);
    expect(history.map((h) => h.detail)).toEqual(['second', 'first']);
  });
});
