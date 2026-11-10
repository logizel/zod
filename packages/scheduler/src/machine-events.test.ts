// Scheduler machine events (the Glass feed's dedup/scout/fetch rows).
// Fake PocketBase; no network calls.

import { describe, expect, it } from 'vitest';
import { runPollTick } from './jobs.js';

interface MachineRow {
  event_type: string;
  tool: string;
  status: string;
  step: string;
  url: string;
  trace_id: string;
  detail: string;
}

function makePb(machineEvents: MachineRow[]) {
  const rows = new Map<string, any>();
  let counter = 0;
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
      if (name === 'machine_events') {
        machineEvents.push(data as unknown as MachineRow);
        return data;
      }
      const row = {
        id: `r${++counter}`,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        ...data,
      };
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
  const pb: any = { collection: (name: string) => coll(name) };
  return pb;
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

const DEF = {
  name: 'events-stub',
  expression: '*/20 * * * *',
  maxRandomDelayMs: 0,
  description: 'stub',
} as any;

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));
}

describe('scheduler machine events', () => {
  it('logs the dedup → scout → scratchpad → fetch chain for a candidate', async () => {
    const machineEvents: MachineRow[] = [];
    const pb = makePb(machineEvents);
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchFn = async () => ({
      markdown: '# capped markdown payload',
      capped: true,
      source: 'jina' as const,
    });
    const logger = makeLogger();

    await runPollTick(DEF, logger.log as any, {
      pb,
      hot,
      cold,
      fetch: fetchFn as never,
      candidates: [{ url: 'https://example.com/event', title: 'Valid Hackathon 2026', snippet: 'cash prize' }],
    });
    await flush();

    const tools = machineEvents.map((e) => `${e.tool}:${e.status}`);
    expect(tools).toContain('dedup.precheck:ok');
    expect(tools).toContain('scratchpad.resume:ok');
    expect(tools).toContain('fetch.facade:start');
    expect(tools.some((t) => t.startsWith('fetch.jina:ok') || t.startsWith('fetch.browser:ok'))).toBe(true);

    const fetchEvent = machineEvents.find((e) => e.tool.startsWith('fetch.') && e.status === 'ok');
    expect(fetchEvent?.url).toBe('https://example.com/event');
    expect(fetchEvent?.duration_ms).toBeGreaterThanOrEqual(0);
    expect(fetchEvent?.trace_id).toBeTruthy();
  });

  it('logs a scout skip for a rejected candidate', async () => {
    const machineEvents: MachineRow[] = [];
    const pb = makePb(machineEvents);
    const hot = { hasFingerprint: async () => false };
    const cold = { findTombstone: async () => null };
    const fetchFn = async () => ({ markdown: 'x', capped: true, source: 'jina' as const });
    const logger = makeLogger();

    await runPollTick(DEF, logger.log as any, {
      pb,
      hot,
      cold,
      fetch: fetchFn as never,
      candidates: [{ url: 'https://example.com/old', title: 'Crypto giveaway airdrop', snippet: 'free tokens' }],
    });
    await flush();

    const scout = machineEvents.find((e) => e.tool === 'scout.prefilter');
    expect(scout).toBeDefined();
    expect(scout?.status).toBe('skip');
    expect(scout?.url).toBe('https://example.com/old');
  });
});
