import { describe, expect, it } from 'vitest';
import { StepPosition } from './scratchpad.js';
import {
  getOrCreateScratchpad,
  advanceToStep2,
  advanceToStep3,
  recordFailure,
  resumeByUrl,
} from './scratchpad.js';

function unescapeFilter(filter: string): string {
  const m = /candidate_url = '(.+)'/u.exec(filter);
  if (!m) return '';
  return m[1].replace(/''/g, "'");
}

function makePb() {
  const rows = new Map<string, any>();
  let counter = 0;
  const coll = (name: string) => ({
    getFirstListItem: async (filter: string) => {
      if (name === 'task_scratchpad') {
        const url = unescapeFilter(filter);
        for (const r of rows.values()) {
          if (r.candidate_url === url) return r;
        }
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
      if (!row) {
        const err: any = new Error('not found');
        err.status = 404;
        throw err;
      }
      Object.assign(row, data, { updated: new Date().toISOString() });
      return row;
    },
    getOne: async (id: string) => rows.get(id),
  });
  const tombstones: any[] = [];
  const pb: any = {
    collection: (name: string) => {
      if (name === 'tombstone_ledger') {
        return { create: async (data: any) => { tombstones.push(data); return data; } };
      }
      return coll(name);
    },
  };
  (pb as any).__tombstones = tombstones;
  return pb as any;
}

describe('scratchpad', () => {
  it('Test 1: getOrCreateScratchpad creates STEP_1 row on first call', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/event');
    expect(r.step_position).toBe('STEP_1');
  });

  it('Test 2: returns existing row on second call (no duplicate)', async () => {
    const pb = makePb();
    const r1 = await getOrCreateScratchpad(pb, 'https://example.com/event');
    const r2 = await getOrCreateScratchpad(pb, 'https://example.com/event');
    expect(r2.id).toBe(r1.id);
  });

  it('Test 3: handles single-quote in URL (escaped filter)', async () => {
    const pb = makePb();
    const url = "https://example.com/x'y";
    const r1 = await getOrCreateScratchpad(pb, url);
    const r2 = await getOrCreateScratchpad(pb, url);
    expect(r2.id).toBe(r1.id);
  });

  it('Test 4: advanceToStep2 updates step_position + capped markdown', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/event');
    await advanceToStep2(pb, r.id, 'hello world');
    const row = await pb.collection('task_scratchpad').getOne(r.id);
    expect(row.step_position).toBe('STEP_2');
    expect(row.partial_buffer).toBe('hello world');
  });

  it('Test 5: recordFailure increments attempts + sets last_error', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/event');
    const res = await recordFailure(pb, r.id, 'boom');
    expect(res.attempts).toBe(1);
    const row = await pb.collection('task_scratchpad').getOne(r.id);
    expect(row.last_error).toBe('boom');
  });

  it('Test 6: recordFailure at 4 returns tombstoned false', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/event');
    for (let i = 0; i < 3; i++) await recordFailure(pb, r.id, 'err');
    const res = await recordFailure(pb, r.id, 'err');
    expect(res.attempts).toBe(4);
    expect(res.tombstoned).toBe(false);
  });

  it('Test 7: recordFailure at 5 returns tombstoned true + tombstone row', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/event');
    for (let i = 0; i < 4; i++) await recordFailure(pb, r.id, 'err');
    const res = await recordFailure(pb, r.id, 'err');
    expect(res.attempts).toBe(5);
    expect(res.tombstoned).toBe(true);
    expect(pb.__tombstones.length).toBe(1);
    expect(pb.__tombstones[0].terminal_status).toBe('fetch_failed');
  });

  it('Test 8: crash resume - STEP_2 row, fetch skipped', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/event');
    await advanceToStep2(pb, r.id, 'cached markdown');
    const { row, shouldFetch } = await resumeByUrl(pb, 'https://example.com/event');
    expect(row.step_position).toBe('STEP_2');
    expect(shouldFetch).toBe(false);
  });

  it('Test 9: crash resume - STEP_1 row, fetch re-run, attempts not incremented', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/event');
    const before = (await pb.collection('task_scratchpad').getOne(r.id)).attempts;
    const { shouldFetch } = await resumeByUrl(pb, 'https://example.com/event');
    expect(shouldFetch).toBe(true);
    const after = (await pb.collection('task_scratchpad').getOne(r.id)).attempts;
    expect(after).toBe(before);
  });

  it('Test 10: StepPosition enum rejects invalid values', () => {
    expect(() => StepPosition.parse('STEP_5')).toThrow();
    expect(() => StepPosition.parse('step_2')).toThrow();
  });

  it('Test 11: getOrCreateScratchpad persists pipeline + candidate_title on create', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/job/1', 'jobs', 'Senior SWE Intern');
    expect(r.pipeline).toBe('jobs');
    expect(r.candidate_title).toBe('Senior SWE Intern');
  });

  it('Test 12: getOrCreateScratchpad defaults pipeline to events and title to empty when omitted', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/event/1');
    expect(r.pipeline).toBe('events');
    expect(r.candidate_title).toBe('');
  });

  it('Test 13: resumeByUrl returns pipeline + candidate_title on the row', async () => {
    const pb = makePb();
    await getOrCreateScratchpad(pb, 'https://example.com/loot/1', 'loot', 'Free AWS credits');
    const { row } = await resumeByUrl(pb, 'https://example.com/loot/1');
    expect(row.pipeline).toBe('loot');
    expect(row.candidate_title).toBe('Free AWS credits');
  });

  it('Test 14: advanceToStep3 moves row to STEP_3 without touching other fields', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/job/1', 'jobs', 'SWE Intern');
    await advanceToStep3(pb, r.id);
    const row = await pb.collection('task_scratchpad').getOne(r.id);
    expect(row.step_position).toBe('STEP_3');
    expect(row.pipeline).toBe('jobs');
    expect(row.candidate_title).toBe('SWE Intern');
    expect(row.partial_buffer).toBe('');
    expect(row.attempts).toBe(0);
  });

  it('Test 15: advanceToStep3 does not affect advanceToStep2 or recordFailure behavior', async () => {
    const pb = makePb();
    const r = await getOrCreateScratchpad(pb, 'https://example.com/job/1', 'jobs', 'SWE Intern');
    await advanceToStep2(pb, r.id, 'cached markdown');
    expect((await pb.collection('task_scratchpad').getOne(r.id)).step_position).toBe('STEP_2');
    await advanceToStep3(pb, r.id);
    expect((await pb.collection('task_scratchpad').getOne(r.id)).step_position).toBe('STEP_3');
    const res = await recordFailure(pb, r.id, 'boom');
    expect(res.attempts).toBe(1);
    expect((await pb.collection('task_scratchpad').getOne(r.id)).last_error).toBe('boom');
  });
});
