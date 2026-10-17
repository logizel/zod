// Boards snapshot endpoint (D-03, D-10, D-12).
//
// GET /api/boards returns an initial board snapshot shaped for the tabbed
// board layout (D-09). Board window: active/upcoming + last 7 days (D-12).
// Rich combined filters (date range, bucket/channel, status, prize range,
// free-text, combined AND) are validated with zod and applied server-side
// per active tab. Read-only v1: no write/mutation endpoints (T-07-05:
// zod Schema.parse() on all filter params; reject invalid with 400; no
// raw SQL/string interpolation).

import * as z from 'zod';

// ---------------------------------------------------------------------------
// Filter schema (T-07-05: validate all filter params; reject invalid with 400)
// ---------------------------------------------------------------------------

export const BoardsFilterSchema = z.object({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  channel: z.string().min(1).optional(),
  status: z
    .enum(['candidate', 'audited', 'routed', 'rejected', 'tombstoned', 'expired'])
    .optional(),
  prize_min: z.coerce.number().min(0).optional(),
  prize_max: z.coerce.number().min(0).optional(),
  q: z.string().min(1).optional(),
});

export type BoardsFilter = z.infer<typeof BoardsFilterSchema>;

export function parseBoardsFilters(query: string): BoardsFilter {
  const params = Object.fromEntries(new URLSearchParams(query));
  return BoardsFilterSchema.parse(params);
}

// ---------------------------------------------------------------------------
// Board tab scopes (D-09): one board visible at a time, filters scoped to tab
// ---------------------------------------------------------------------------

export type BoardTab = {
  tab: string;
  window: string;
  count: number;
  rows: Array<Record<string, unknown>>;
};

export type BoardsResponse = {
  boards: BoardTab[];
  count: number;
  ts: number;
}

const BOARD_TAB_DEFS: Array<{
  tab: string;
  window: string;
  scope: (row: Record<string, unknown>) => boolean;
}> = [
  {
    tab: 'events-local',
    window: 'active/upcoming + last 7 days',
    scope: (r) => r.pipeline === 'events' && isLocalChannel(String(r.bucket_channel ?? '')),
  },
  {
    tab: 'events-travel',
    window: 'active/upcoming + last 7 days',
    scope: (r) => r.pipeline === 'events' && isTravelChannel(String(r.bucket_channel ?? '')),
  },
  {
    tab: 'events-online',
    window: 'active/upcoming + last 7 days',
    scope: (r) => r.pipeline === 'events' && isOnlineChannel(String(r.bucket_channel ?? '')),
  },
  {
    tab: 'tba-queue',
    window: 'active/upcoming + last 7 days',
    scope: (r) => r.deadlines?.tba === true,
  },
  {
    tab: 'jobs-sys',
    window: 'active/upcoming + last 7 days',
    scope: (r) => r.pipeline === 'jobs' && isSysChannel(String(r.bucket_channel ?? '')),
  },
  {
    tab: 'jobs-general',
    window: 'active/upcoming + last 7 days',
    scope: (r) => r.pipeline === 'jobs' && isGeneralChannel(String(r.bucket_channel ?? '')),
  },
  {
    tab: 'loot',
    window: 'active/upcoming + last 7 days',
    scope: (r) => r.pipeline === 'loot',
  },
  {
    tab: 'audit-log',
    window: 'active/upcoming + last 7 days',
    scope: (r) => ['rejected', 'tombstoned', 'audited'].includes(String(r.status ?? '')),
  },
];

function isLocalChannel(ch: string): boolean {
  const c = ch.toLowerCase();
  return c.includes('local') || c.includes('dk') || c.includes('udupi');
}
function isTravelChannel(ch: string): boolean {
  return ch.toLowerCase().includes('travel');
}
function isOnlineChannel(ch: string): boolean {
  const c = ch.toLowerCase();
  return c.includes('online') || c.includes('1lakh');
}
function isSysChannel(ch: string): boolean {
  const c = ch.toLowerCase();
  return c.includes('sys') || c.includes('cp') || c.includes('sec');
}
function isGeneralChannel(ch: string): boolean {
  return ch.toLowerCase().includes('general');
}

// ---------------------------------------------------------------------------
// Board window (D-12): active/upcoming + last 7 days
// ---------------------------------------------------------------------------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const ACTIVE_STATUSES = new Set(['candidate', 'audited', 'routed']);

function inBoardWindow(row: Record<string, unknown>, nowMs: number): boolean {
  const status = String(row.status ?? '');
  if (ACTIVE_STATUSES.has(status)) return true;
  const endDate = row.end_date ? Date.parse(String(row.end_date)) : NaN;
  if (Number.isFinite(endDate) && nowMs - endDate <= SEVEN_DAYS_MS) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Filter application (server-side, combined AND)
// ---------------------------------------------------------------------------

export function applyBoardFilters(
  rows: Array<Record<string, unknown>>,
  filters: BoardsFilter,
  nowMs: number = Date.now(),
): Array<Record<string, unknown>> {
  return rows.filter((row) => {
    if (!inBoardWindow(row, nowMs)) return false;

    if (filters.start_date && row.end_date) {
      if (Date.parse(String(row.end_date)) < Date.parse(filters.start_date)) return false;
    }
    if (filters.end_date && row.end_date) {
      if (Date.parse(String(row.end_date)) > Date.parse(filters.end_date)) return false;
    }
    if (filters.channel && String(row.bucket_channel ?? '') !== filters.channel) return false;
    if (filters.status && String(row.status ?? '') !== filters.status) return false;
    if (filters.prize_min != null) {
      const prize = row.prize_cash_inr == null ? 0 : Number(row.prize_cash_inr);
      if (prize < filters.prize_min) return false;
    }
    if (filters.prize_max != null) {
      const prize = row.prize_cash_inr == null ? 0 : Number(row.prize_cash_inr);
      if (prize > filters.prize_max) return false;
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const haystack = `${String(row.title ?? '')} ${String(row.organizer ?? '')}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

export type ListOpportunities = () => Promise<Array<Record<string, unknown>>>;

export interface HandleBoardsOpts {
  rows?: Array<Record<string, unknown>>;
  listOpportunities?: ListOpportunities;
  nowMs?: number;
}

/** Handle GET /api/boards: return JSON boards array shaped for board tabs. */
export function handleBoards(
  _req: { url: string | null },
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
  },
  opts: HandleBoardsOpts = {},
): void {
  const nowMs = opts.nowMs ?? Date.now();
  const rows: Array<Record<string, unknown>> = opts.rows ?? [];

  let filters: BoardsFilter;
  try {
    const query = _req.url ? new URL(_req.url, 'http://localhost').search : '';
    filters = parseBoardsFilters(query);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid filter parameters', issues: err.issues }));
      return;
    }
    throw err;
  }

  const filtered = applyBoardFilters(rows, filters, nowMs);

  // Shape into tabs, each tab scoped + filtered (filters scoped to active tab)
  const boards = BOARD_TAB_DEFS.map((def) => {
    const tabRows = filtered.filter(def.scope);
    return { tab: def.tab, window: def.window, count: tabRows.length, rows: tabRows };
  });

  const response: BoardsResponse = {
    boards,
    count: boards.reduce((s, b) => s + b.count, 0),
    ts: nowMs,
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}
