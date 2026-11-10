// System snapshot (GET /api/system).
//
// Local operator view: process uptime, SSE viewers, GC marker, event volume,
// and the latest scheduler tick per job. Read-only.

import {
  type MachineEventDto,
  toMachineEventDto,
} from './machine.js';
import { sourceNameFromEvent } from './sources.js';

export type SystemJob = {
  name: string;
  lastStatus: string;
  lastAt: string;
  durationMs: number | null;
  detail: string;
};

export type SystemResponse = {
  ts: number;
  uptimeSec: number;
  node: string;
  memory: { rssMb: number; heapUsedMb: number };
  sse: { viewers: number; capacity: number; lastEventAgeMs: number };
  gc: { lastSuccessMs: number | null; ageMs: number | null };
  events: { retained: number; latestAt: string | null };
  jobs: SystemJob[];
};

export interface SystemPb {
  collection(name: string): {
    getList(
      page: number,
      perPage: number,
      options?: unknown,
    ): Promise<{ items: Array<Record<string, unknown>>; totalItems?: number }>;
    getFirstListItem?(
      filter: string,
      options?: unknown,
    ): Promise<Record<string, unknown>>;
  };
}

export interface SystemHub {
  size: number;
  capacity: number;
  lastEventAgeMs: number;
}

function toEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function handleSystem(
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
  },
  opts: { pb: SystemPb; hub: SystemHub; nowMs?: number },
): Promise<void> {
  const nowMs = opts.nowMs ?? Date.now();
  try {
    const machine = opts.pb.collection('machine_events');
    const latestPage = await machine.getList(1, 1, { sort: '-created' });
    const latest = latestPage.items?.[0]
      ? toMachineEventDto(latestPage.items[0])
      : null;
    const schedulerPage = await machine.getList(1, 200, {
      sort: '-created',
      filter: 'event_type = "scheduler"',
    });
    const schedulerEvents = (schedulerPage.items ?? []).map(toMachineEventDto);

    let gcLastSuccessMs: number | null = null;
    try {
      const telemetry = opts.pb.collection('agent_telemetry');
      if (typeof telemetry.getFirstListItem === 'function') {
        const marker = await telemetry.getFirstListItem(
          `slot = 'gc-last-success'`,
          { sort: '-updated' },
        );
        gcLastSuccessMs =
          toEpochMs(marker.detail) ??
          toEpochMs(marker.updated) ??
          toEpochMs(marker.created);
      }
    } catch {
      // No GC marker yet — expected on a fresh instance.
    }

    const latestByJob = new Map<string, MachineEventDto>();
    // Scheduler events are newest-first; the first event per job wins.
    for (const event of schedulerEvents) {
      const name = sourceNameFromEvent(event);
      if (!latestByJob.has(name)) latestByJob.set(name, event);
    }

    const body: SystemResponse = {
      ts: nowMs,
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
      },
      sse: {
        viewers: opts.hub.size,
        capacity: opts.hub.capacity,
        lastEventAgeMs: opts.hub.lastEventAgeMs,
      },
      gc: {
        lastSuccessMs: gcLastSuccessMs,
        ageMs: gcLastSuccessMs == null ? null : nowMs - gcLastSuccessMs,
      },
      events: {
        retained: latestPage.totalItems ?? 0,
        latestAt: latest?.created ?? null,
      },
      jobs: [...latestByJob.values()].map((event) => ({
        name: sourceNameFromEvent(event),
        lastStatus: event.status,
        lastAt: event.created,
        durationMs: event.duration_ms,
        detail: event.detail || event.output_summary,
      })),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream unavailable' }));
  }
}
