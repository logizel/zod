// Pool Health snapshot (GET /api/pools).
//
// Combines the latest agent_telemetry bucket state with today's machine_events
// LLM attempts: state pill, cooldown, calls, errors, and last call per
// provider × model bucket.

import {
  type MachineEventDto,
  toMachineEventDto,
} from './machine.js';
import { bucketStateFrom } from './sse.js';

export type PoolState = 'READY' | 'ACTIVE' | '60s-COOLDOWN' | 'DAILY-CAP';

export type PoolCard = {
  provider: string;
  model: string;
  state: PoolState;
  cooldownUntil: string | null;
  dailyCapRemaining: number | null;
  callsToday: number;
  errorsToday: number;
  cooldownsToday: number;
  lastCallAt: string | null;
  lastTool: string;
  lastDurationMs: number | null;
};

export type PoolsResponse = {
  ts: number;
  pools: PoolCard[];
};

export interface PoolsPb {
  collection(name: string): {
    getFullList(options?: unknown): Promise<Array<Record<string, unknown>>>;
    getList?(
      page: number,
      perPage: number,
      options?: unknown,
    ): Promise<{ items: Array<Record<string, unknown>> }>;
  };
}

function isToday(iso: string, nowMs: number): boolean {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  const now = new Date(nowMs);
  const then = new Date(ms);
  return (
    now.getUTCFullYear() === then.getUTCFullYear() &&
    now.getUTCMonth() === then.getUTCMonth() &&
    now.getUTCDate() === then.getUTCDate()
  );
}

function stateFromTelemetry(row: Record<string, unknown>): PoolState {
  const state = bucketStateFrom(String(row.status ?? ''), String(row.detail ?? ''));
  return state as PoolState;
}

export function buildPools(input: {
  telemetryRows: Array<Record<string, unknown>>;
  eventRows: Array<Record<string, unknown>>;
  nowMs?: number;
}): PoolsResponse {
  const nowMs = input.nowMs ?? Date.now();
  const pools = new Map<string, PoolCard>();

  // Newest-first input: the first row per bucket wins.
  for (const row of input.telemetryRows) {
    const provider = String(row.provider ?? '');
    const model = String(row.model ?? '');
    if (!provider || !model) continue;
    const key = `${provider}:${model}`;
    if (pools.has(key)) continue;
    const updated = String(row.updated ?? row.created ?? '');
    const state = stateFromTelemetry(row);
    pools.set(key, {
      provider,
      model,
      state,
      cooldownUntil:
        state === '60s-COOLDOWN' && Number.isFinite(Date.parse(updated))
          ? new Date(Date.parse(updated) + 60_000).toISOString()
          : null,
      dailyCapRemaining: null,
      callsToday: 0,
      errorsToday: 0,
      cooldownsToday: 0,
      lastCallAt: updated || null,
      lastTool: String(row.step ?? ''),
      lastDurationMs:
        row.duration_ms == null || row.duration_ms === ''
          ? null
          : Number(row.duration_ms),
    });
  }

  const events = input.eventRows
    .map(toMachineEventDto)
    .filter(
      (event) =>
        event.event_type === 'llm' &&
        event.provider &&
        event.model &&
        isToday(event.created, nowMs),
    )
    .sort((a, b) => Date.parse(a.created) - Date.parse(b.created));

  for (const event of events) {
    const key = `${event.provider}:${event.model}`;
    let pool = pools.get(key);
    if (!pool) {
      pool = {
        provider: event.provider,
        model: event.model,
        state: 'READY',
        cooldownUntil: null,
        dailyCapRemaining: null,
        callsToday: 0,
        errorsToday: 0,
        cooldownsToday: 0,
        lastCallAt: null,
        lastTool: '',
        lastDurationMs: null,
      };
      pools.set(key, pool);
    }
    if (event.status !== 'start') pool.callsToday += 1;
    if (event.status === 'error') pool.errorsToday += 1;
    if (event.status === 'cooldown') pool.cooldownsToday += 1;
    pool.lastCallAt = event.created;
    pool.lastTool = event.tool;
    pool.lastDurationMs = event.duration_ms;
    if (event.status === 'cooldown') {
      pool.state = '60s-COOLDOWN';
      pool.cooldownUntil = new Date(Date.parse(event.created) + 60_000).toISOString();
    } else if (event.status === 'start') {
      pool.state = 'ACTIVE';
    } else if (pool.state !== '60s-COOLDOWN') {
      pool.state = 'READY';
    }
  }

  return {
    ts: nowMs,
    pools: [...pools.values()].sort((a, b) =>
      `${a.provider}:${a.model}`.localeCompare(`${b.provider}:${b.model}`),
    ),
  };
}

export async function handlePools(
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
  },
  opts: { pb: PoolsPb; nowMs?: number },
): Promise<void> {
  try {
    const telemetryRows = await opts.pb
      .collection('agent_telemetry')
      .getFullList({ sort: '-updated' });
    let eventRows: Array<Record<string, unknown>> = [];
    const machineCollection = opts.pb.collection('machine_events');
    if (typeof machineCollection.getList === 'function') {
      const page = await machineCollection.getList(1, 500, { sort: '-created' });
      eventRows = page.items ?? [];
    }
    const body = buildPools({
      telemetryRows,
      eventRows,
      nowMs: opts.nowMs,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream unavailable' }));
  }
}
