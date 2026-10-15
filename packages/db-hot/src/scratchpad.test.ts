import { describe, expect, it } from 'vitest';
import { getOrCreateScratchpad, advanceToStep2, recordFailure } from './scratchpad.js';

function makePb() {
  const rows = new Map<string, any>();
  let counter = 0;
  const coll = (name: string) => ({
    getFirstListItem: async (filter: string) => {
      if (name === 'task_scratchpad') {
        const m = /candidate_url = '(.+)'/u.exec(filter);
        const url = m ? m[1] : '';
        for (const r of rows.values()) {
          if (r.candidate_url === url) return r;
        }
        const err: any = new Error('not found');
        err.status = 404;
        throw err;
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
      Object.assign(row, data, { updated: new Date().toISOString() });
      return row;
    },
    getOne: async (id: string) => rows.get(id),
  });
  const tombstones: any[] = [];
  const pb: any = {
    collection: (name: string) => {
      if (name === 'tombstone_ledger') {
        return {
          create: async (data: any) => { tombstones.push(data); return data; },
        };
      }
      return coll(name);
    },
  };
  (pb as any).__tombstones = tombstones;
  return pb as any;
}

describe('scratchpad', () => {
  it('creates STEP_1 on first call and returns existing on second', async () => {
    const pb = makePb();
    const r1 = await getOrCreateScratchpad(pb, 'https://example.com/event');
    expect(r1.step_position).toBe('STEP_1');
    const r2 = await getOrCreateScratchpad(pb, 'https://example.com/event');
    expect(r2.id).toBe(r1.id);
  });

  it('advanceToStep2 stores capped markdown and STEP_2', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/event');
    await advanceToStep2(pb, r.id, 'hello world');
    const row = await (pb as any).collection('task_scratchpad').getOne(r.id);
    expect(row.step_position).toBe('STEP_2');
    expect(row.partial_buffer).toBe('hello world');
  });

  it('recordFailure increments attempts and tombstones at >=5', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/event');
    for (let i = 0; i < 4; i++) {
      const res = await recordFailure(pb, r.id, 'err');
      expect(res.tombstoned).toBe(false);
    }
    const res5 = await recordFailure(pb, r.id, 'err');
    expect(res5.attempts).toBe(5);
    expect(res5.tombstoned).toBe(true);
    expect((pb as any).__tombstones.length).toBe(1);
  });
});
