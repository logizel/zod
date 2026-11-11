// Sources snapshot (GET /api/sources).
//
// Derives adapter health from scheduler machine_events. Known scheduler jobs
// are always listed so an idle source is visibly idle rather than missing.
//
// Lookback: the gateway timers write several machine_events per minute, so a
// single "latest N rows" query window shrinks to a couple of hours and makes
// hourly/daily sources look like they never ran. Each known source is queried
// on its own job tool over a 200-row window (>24h even for the 15-minute
// portals), and discovered jobs get their own recent window.

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
  /** Last URL the source fetched (social: the X/LinkedIn listing target). */
  lastTarget: string;
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

/** Escape a value for a PocketBase filter expression. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
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

export function sourceNameFromEvent(event: MachineEventDto): string {
  const job = event.meta?.['job'];
  if (typeof job === 'string' && job) return job;
  // runStubTick emits tool "job.<name>" + trace "job:<name>" (no meta.job);
  // older scheduler.tick rows used the "job-<name>" trace prefix.
  if (event.tool.startsWith('job.')) return event.tool.slice('job.'.length);
  if (event.trace_id.startsWith('job-')) return event.trace_id.slice('job-'.length);
  if (event.trace_id.startsWith('job:')) return event.trace_id.slice('job:'.length);
  const agent = event.agent || 'scheduler';
  return agent.startsWith('scheduler:') ? agent.slice('scheduler:'.length) : agent;
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
      lastTarget: '',
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
        lastTarget: '',
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

/** Query each known source's own scheduler events (24h+ lookback). */
async function loadPerSource(
  pb: SourcesPb,
): Promise<Array<Record<string, unknown>>> {
  const pages = await Promise.all(
    KNOWN_SOURCES.map((known) =>
      pb.collection('machine_events').getList(1, 200, {
        sort: '-created',
        filter: `event_type = "scheduler" && tool = ${quote(`job.${known.name}`)}`,
      }),
    ),
  );
  return pages.flatMap((page) => page.items ?? []);
}

/** Latest social fetch event → target URL + result for the X/LinkedIn card. */
async function loadSocialFetch(pb: SourcesPb): Promise<{
  url: string;
  status: string;
  detail: string;
}> {
  try {
    const page = await pb.collection('machine_events').getList(1, 1, {
      sort: '-created',
      filter: 'event_type = "fetch" && tool = "fetch.social"',
    });
    const row = page.items?.[0];
    return {
      url: String(row?.['url'] ?? ''),
      status: String(row?.['status'] ?? ''),
      detail: String(row?.['output_summary'] || row?.['detail'] || ''),
    };
  } catch {
    // Optional enrichment: a missing event never fails the snapshot.
    return { url: '', status: '', detail: '' };
  }
}

/** Recent scheduler events for discovered jobs (audit-drain, gc, relay...). */
async function loadOtherJobs(pb: SourcesPb): Promise<Array<Record<string, unknown>>> {
  const exclusions = KNOWN_SOURCES.map(
    (known) => `tool != ${quote(`job.${known.name}`)}`,
  ).join(' && ');
  const page = await pb.collection('machine_events').getList(1, 100, {
    sort: '-created',
    filter:
      `event_type = "scheduler" && ${exclusions} && ` +
      'tool !~ "job.gateway-warmup" && ' +
      'tool !~ "job.gateway-bucket-cooldown" && ' +
      'tool !~ "job.gateway-daily-cap-reset"',
  });
  return page.items ?? [];
}

export async function handleSources(
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
  },
  opts: { pb: SourcesPb; nowMs?: number },
): Promise<void> {
  try {
    const [perSource, socialFetch, otherJobs] = await Promise.all([
      loadPerSource(opts.pb),
      loadSocialFetch(opts.pb),
      loadOtherJobs(opts.pb),
    ]);
    const body = buildSources({
      eventRows: [...perSource, ...otherJobs],
      nowMs: opts.nowMs,
    });
    const socialCard = body.sources.find((source) => source.name === 'social-stub');
    if (socialCard) {
      if (socialFetch.url) socialCard.lastTarget = socialFetch.url;
      // A skipped/errored fetch is credential- or wall-related and actionable
      // (e.g. expired burner cookies); surface it in the card's error column.
      if (
        socialFetch.detail &&
        (socialFetch.status === 'skip' || socialFetch.status === 'error')
      ) {
        socialCard.error = socialFetch.detail;
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream unavailable' }));
  }
}
