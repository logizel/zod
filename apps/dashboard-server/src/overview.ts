// Overview + Pipeline Flow snapshot (GET /api/overview).
//
// Joins three hot collections into one read-only kanban:
//   task_scratchpad  -> queued / fetching / auditing / routing cards
//   opportunities    -> routing / delivered cards (+ counts)
//   machine_events   -> current tool/provider/model per card + live stats

import {
  type MachineEventDto,
  toMachineEventDto,
} from './machine.js';

export const OVERVIEW_STAGES = [
  'queued',
  'fetching',
  'auditing',
  'routing',
  'delivered',
] as const;
export type OverviewStage = (typeof OVERVIEW_STAGES)[number];

export type OverviewCard = {
  id: string;
  title: string;
  url: string;
  pipeline: string;
  source: string;
  stage: OverviewStage;
  step: string;
  channel: string;
  status: string;
  prize_cash_inr: number | null;
  updated: string;
  end_date: string | null;
  provider: string;
  model: string;
  tool: string;
  detail: string;
};

export type OverviewStats = {
  activeAgents: number;
  recentCalls: number;
  errors: number;
  batonPasses: number;
  deliveredToday: number;
};

export type OverviewResponse = {
  ts: number;
  stages: Record<OverviewStage, OverviewCard[]>;
  counts: Record<OverviewStage, number>;
  stats: OverviewStats;
};

export interface OverviewPb {
  collection(name: string): {
    getFullList(options?: unknown): Promise<Array<Record<string, unknown>>>;
    getList?(
      page: number,
      perPage: number,
      options?: unknown,
    ): Promise<{ items: Array<Record<string, unknown>> }>;
  };
}

const STAGE_RANK: Record<OverviewStage, number> = {
  queued: 0,
  fetching: 1,
  auditing: 2,
  routing: 3,
  delivered: 4,
};

const MAX_CARDS_PER_STAGE = 60;

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

function shortTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last).replace(/[-_]+/g, ' ') : parsed.hostname;
  } catch {
    return url;
  }
}

function eventKey(event: MachineEventDto): string[] {
  const keys: string[] = [];
  if (event.trace_id) keys.push(`trace:${event.trace_id}`);
  if (event.url) keys.push(`url:${normalizeUrl(event.url)}`);
  return keys;
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

/**
 * Latest machine event per trace/url. Input rows may be newest-first from
 * PocketBase, so sort oldest-first before reducing.
 */
function latestEventsByKey(eventRows: Array<Record<string, unknown>>): Map<string, MachineEventDto> {
  const events = eventRows
    .map(toMachineEventDto)
    .sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
  const latest = new Map<string, MachineEventDto>();
  for (const event of events) {
    for (const key of eventKey(event)) latest.set(key, event);
  }
  return latest;
}

function lookupEvent(
  latest: Map<string, MachineEventDto>,
  url: string,
  traceId = '',
): MachineEventDto | null {
  if (traceId && latest.has(`trace:${traceId}`)) return latest.get(`trace:${traceId}`) ?? null;
  if (url && latest.has(`url:${normalizeUrl(url)}`)) {
    return latest.get(`url:${normalizeUrl(url)}`) ?? null;
  }
  return null;
}

function stepStage(step: string): OverviewStage {
  if (step.startsWith('STEP_3')) return 'routing';
  if (step.startsWith('STEP_4')) return 'delivered';
  if (step.startsWith('STEP_2')) return 'auditing';
  return 'queued';
}

function opportunityStage(status: string): OverviewStage | null {
  if (status === 'routed') return 'delivered';
  if (status === 'audited') return 'routing';
  return null;
}

function withEventContext(
  card: OverviewCard,
  event: MachineEventDto | null,
): OverviewCard {
  if (!event) return card;
  return {
    ...card,
    provider: event.provider || card.provider,
    model: event.model || card.model,
    tool: event.tool || card.tool,
    detail: event.detail || card.detail,
  };
}

export function buildOverview(input: {
  scratchpadRows: Array<Record<string, unknown>>;
  opportunityRows: Array<Record<string, unknown>>;
  eventRows: Array<Record<string, unknown>>;
  nowMs?: number;
}): OverviewResponse {
  const nowMs = input.nowMs ?? Date.now();
  const latest = latestEventsByKey(input.eventRows);
  const cards = new Map<string, OverviewCard>();

  const upsert = (card: OverviewCard): void => {
    const key = normalizeUrl(card.url) || `${card.pipeline}:${card.title}`;
    const existing = cards.get(key);
    if (!existing || STAGE_RANK[card.stage] > STAGE_RANK[existing.stage]) {
      cards.set(key, card);
    }
  };

  for (const row of input.scratchpadRows) {
    const url = String(row.candidate_url ?? '');
    if (!url) continue;
    const event = lookupEvent(latest, url);
    const step = String(row.step_position ?? 'STEP_1');
    let stage = stepStage(step);
    if (stage === 'queued' && event?.event_type === 'fetch' && event.status === 'start') {
      stage = 'fetching';
    }
    upsert(
      withEventContext(
        {
          id: String(row.id ?? url),
          title: String(row.candidate_title ?? '') || shortTitleFromUrl(url),
          url,
          pipeline: String(row.pipeline ?? ''),
          source: sourceHost(url),
          stage,
          step,
          channel: '',
          status: step,
          prize_cash_inr: null,
          updated: String(row.updated ?? row.created ?? ''),
          end_date: null,
          provider: '',
          model: '',
          tool: '',
          detail: String(row.last_error ?? ''),
        },
        event,
      ),
    );
  }

  for (const row of input.opportunityRows) {
    const status = String(row.status ?? '');
    const stage = opportunityStage(status);
    if (!stage) continue;
    const links =
      row.links && typeof row.links === 'object'
        ? (row.links as Record<string, unknown>)
        : {};
    const url = String(links.official ?? '');
    if (!url) continue;
    const event = lookupEvent(latest, url);
    upsert(
      withEventContext(
        {
          id: String(row.id ?? url),
          title: String(row.title ?? '') || shortTitleFromUrl(url),
          url,
          pipeline: String(row.pipeline ?? ''),
          source: sourceHost(url),
          stage,
          step: stage === 'delivered' ? 'STEP_4' : 'STEP_3',
          channel: String(row.bucket_channel ?? ''),
          status,
          prize_cash_inr:
            row.prize_cash_inr == null || row.prize_cash_inr === ''
              ? null
              : Number(row.prize_cash_inr),
          updated: String(row.updated ?? row.created ?? ''),
          end_date: row.end_date == null ? null : String(row.end_date),
          provider: '',
          model: '',
          tool: '',
          detail: String(row.audit_summary ?? '').slice(0, 240),
        },
        event,
      ),
    );
  }

  const stages: Record<OverviewStage, OverviewCard[]> = {
    queued: [],
    fetching: [],
    auditing: [],
    routing: [],
    delivered: [],
  };
  for (const card of cards.values()) {
    if (stages[card.stage].length < MAX_CARDS_PER_STAGE) {
      stages[card.stage].push(card);
    }
  }
  for (const stage of OVERVIEW_STAGES) {
    stages[stage].sort(
      (a, b) => Date.parse(b.updated || '0') - Date.parse(a.updated || '0'),
    );
  }

  const eventDtos = input.eventRows.map(toMachineEventDto);
  const activeAgents = new Set(
    eventDtos
      .filter(
        (event) =>
          event.agent &&
          (event.status === 'start' || event.status === 'ok') &&
          nowMs - Date.parse(event.created) < 10 * 60 * 1000,
      )
      .map((event) => event.agent),
  );

  return {
    ts: nowMs,
    stages,
    counts: {
      queued: stages.queued.length,
      fetching: stages.fetching.length,
      auditing: stages.auditing.length,
      routing: stages.routing.length,
      delivered: stages.delivered.length,
    },
    stats: {
      activeAgents: activeAgents.size,
      recentCalls: eventDtos.length,
      errors: eventDtos.filter((event) => event.status === 'error').length,
      batonPasses: eventDtos.filter((event) => event.baton_to).length,
      deliveredToday: input.opportunityRows.filter(
        (row) =>
          String(row.status ?? '') === 'routed' &&
          isToday(String(row.updated ?? row.created ?? ''), nowMs),
      ).length,
    },
  };
}

export async function handleOverview(
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
  },
  opts: { pb: OverviewPb; nowMs?: number },
): Promise<void> {
  try {
    const [scratchpadRows, opportunityRows] = await Promise.all([
      opts.pb.collection('task_scratchpad').getFullList({ sort: '-updated' }),
      opts.pb.collection('opportunities').getFullList({ sort: '-updated' }),
    ]);
    let eventRows: Array<Record<string, unknown>> = [];
    const machineCollection = opts.pb.collection('machine_events');
    if (typeof machineCollection.getList === 'function') {
      const page = await machineCollection.getList(1, 500, { sort: '-created' });
      eventRows = page.items ?? [];
    }
    const body = buildOverview({
      scratchpadRows,
      opportunityRows,
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
