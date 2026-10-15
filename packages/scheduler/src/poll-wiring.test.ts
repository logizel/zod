import { describe, expect, it } from 'vitest';
import { runPollTick } from './jobs.js';

function makePb() {
  const rows = new Map<string, any>();
  let counter = 0;
  const tombstones: any[] = [];
  const coll = (name: string) => ({
    getFirstListItem: async (filter: string) => {
      const m = /candidate_url = '(.+)'/u.exec(filter);
      const url = m ? m[1].replace(/''/g, "'") : '';
      for (const r of rows.values()) {
        if (r.candidate_url === url) return r;
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
  const pb: any = {
    collection: (name: string) => {
      if (name === 'tombstone_ledger') {
        return { create: async (data: any) => { tombstones.push(data); return data; } };
      }
      return coll(name);
    },
  };
  (pb as any).__rows = rows;
  (pb as any).__tombstones = tombstones;
  return pb as any;
}

function makeLogger() {
  const records: any[] = [];
  const build = (b: Record<string, unknown>): any => ({
    info: (...a: any[]) => records.push({ level: 'info', bindings: b, args: a }),
    warn: (...a: any[]) => records.push({ level: 'warn', bindings: b, args: a }),
    child: (e: Record<string, unknown>) => build({ ...b, ...e }),
  });
  return { log: build({}), records };
}

describe('scheduler poll wiring (tracer order)', () => {
  it('passes a valid candidate through prefilter → scratchpad → fetch → STEP_2', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: '# capped markdown payload', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const def = {
      name: 'events-stub',
      expression: '*/20 * * * *',
      maxRandomDelayMs: 0,
      description: 'stub',
    } as any;
    const candidates = [{ url: 'https://example.com/event', title: 'Valid Hackathon 2026', snippet: 'cash prize' }];

    await runPollTick(def, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    expect(fetchCalls).toHaveLength(1);
    const rows = [...(pb as any).__rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].step_position).toBe('STEP_2');
    expect(rows[0].partial_buffer).toContain('capped markdown');
  });

  it('scout-rejects expired candidates without fetching', async () => {
    const pb = makePb();
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchCalls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchCalls.push(url);
      return { markdown: 'x', capped: true, source: 'jina' as const };
    };
    const logger = makeLogger();
    const def = { name: 'events-stub', expression: '*/20 * * * *', maxRandomDelayMs: 0, description: 'stub' } as any;
    const candidates = [{ url: 'https://example.com/old', title: 'Crypto giveaway airdrop', snippet: 'free tokens' }];

    await runPollTick(def, logger.log as any, { pb, hot, cold, fetch: fetchFn, candidates });

    expect(fetchCalls).toHaveLength(0);
    const tombstones = (pb as any).__tombstones;
    expect(tombstones.length).toBeGreaterThanOrEqual(1);
    expect(tombstones[0].terminal_status).toBe('scout_rejected');
  });
});
