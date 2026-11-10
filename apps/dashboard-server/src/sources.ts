// Sources snapshot (GET /api/sources).
//
// Derives adapter health from scheduler machine_events. Known scheduler jobs
// are always listed so an idle source is visibly idle rather than missing.

import {
  type MachineEventDto,
  toMachineEventDto,
} from './machine.js';

export type SourceKind = 'portal' | 'jobs' | 'local' | 'social' | 'loot' | 'other';

export type SourceCard = {
  name: string;
  label: string;
  kind: SourceKind;
  lastStatus: string | null;
  lastAt: string | null;
  durationMs: number | null;
  candidates: number | null;
  error: string;
  runsToday: number;
  failuresToday: number;
};

export type SourcesResponse = {
  ts: number;
  sources: SourceCard[];
};

export interface SourcesPb {
  collection(name: string): {
    getList(
      page: number,
      perPage: number,
      options?: unknown,
    ): Promise<{ items: Array<Record<string, unknown>> }>;
  };
}

const KNOWN_SOURCES: Array<{ name: string; label: string; kind: SourceKind }> = [
  { name: 'portal-ctftime', label: 'CTFtime', kind: 'portal' },
  { name: 'portal-clist', label: 'CLIST.by', kind: 'portal' },
  { name: 'portal-unstop', label: 'Unstop', kind: 'portal' },
  { name: 'portal-devfolio', label: 'Devfolio', kind: 'portal' },
  { name: 'portal-devpost', label: 'Devpost', kind: 'portal' },
  { name: 'portal-luma', label: 'Luma', kind: 'portal' },
  { name: 'portal-meetup', label: 'Meetup', kind: 'portal' },
  { name: 'jobs-poll', label: 'Jobs sources', kind: 'jobs' },
  { name: 'loot-watchlist', label: 'Loot vendors', kind: 'loot' },
  { name: 'local-stub', label: 'DK / Udupi domains', kind: 'local' },
  { name: 'social-stub', label: 'X / LinkedIn', kind: 'social' },
];

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

export function sourceNameFromEvent(event: MachineEventDto): string {
  const job = event.meta?.['job'];
  if (typeof job === 'string' && job) return job;
  if (event.trace_id.startsWith('job-')) return event.trace_id.slice(4);
  return event.agent || 'scheduler';
}

export function buildSources(input: {
  eventRows: Array<Record<string, unknown>>;
  nowMs?: number;
}): SourcesResponse {
  const nowMs = input.nowMs ?? Date.now();
  const cards = new Map<string, SourceCard>();
  for (const known of KNOWN_SOURCES) {
    cards.set(known.name, {
      ...known,
      lastStatus: null,
      lastAt: null,
      durationMs: null,
      candidates: null,
      error: '',
      runsToday: 0,
      failuresToday: 0,
    });
  }

  const events = input.eventRows
    .map(toMachineEventDto)
    .filter((event) => event.event_type === 'scheduler')
    .sort((a, b) => Date.parse(a.created) - Date.parse(b.created));

  for (const event of events) {
    const name = sourceNameFromEvent(event);
    let card = cards.get(name);
    if (!card) {
      card = {
        name,
        label: name,
        kind: 'other',
        lastStatus: null,
        lastAt: null,
        durationMs: null,
        candidates: null,
        error: '',
        runsToday: 0,
        failuresToday: 0,
      };
      cards.set(name, card);
    }
    card.lastStatus = event.status;
    card.lastAt = event.created;
    card.durationMs = event.duration_ms;
    const candidates = event.meta?.['candidates'];
    card.candidates =
      typeof candidates === 'number' ? candidates : card.candidates;
    card.error =
      event.status === 'error' ? event.output_summary || event.detail : '';
    if (isToday(event.created, nowMs) && event.status === 'ok') card.runsToday += 1;
    if (isToday(event.created, nowMs) && event.status === 'error') {
      card.failuresToday += 1;
    }
  }

  return {
    ts: nowMs,
    sources: [...cards.values()].sort((a, b) => {
      const rank = (kind: SourceKind) => (kind === 'other' ? 1 : 0);
      return rank(a.kind) - rank(b.kind) || a.label.localeCompare(b.label);
    }),
  };
}

export async function handleSources(
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
  },
  opts: { pb: SourcesPb; nowMs?: number },
): Promise<void> {
  try {
    const page = await opts.pb.collection('machine_events').getList(1, 500, {
      sort: '-created',
    });
    const body = buildSources({
      eventRows: page.items ?? [],
      nowMs: opts.nowMs,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream unavailable' }));
  }
}
