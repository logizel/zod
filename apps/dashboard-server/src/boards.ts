// Boards snapshot endpoint (D-03, D-12).
//
// GET /api/boards returns an initial board snapshot shaped for the tabbed
// board layout (D-09). Board window: active/upcoming + last 7 days (D-12).

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
};

// Tabbed board definitions (D-09): Events Local/Travel/Online, TBA queue,
// Jobs Sys vs General, Loot, audit & rejection log.
const BOARD_TABS: BoardTab[] = [
  { tab: 'events-local', window: 'active/upcoming + last 7 days', count: 0, rows: [] },
  { tab: 'events-travel', window: 'active/upcoming + last 7 days', count: 0, rows: [] },
  { tab: 'events-online', window: 'active/upcoming + last 7 days', count: 0, rows: [] },
  { tab: 'tba-queue', window: 'active/upcoming + last 7 days', count: 0, rows: [] },
  { tab: 'jobs-sys', window: 'active/upcoming + last 7 days', count: 0, rows: [] },
  { tab: 'jobs-general', window: 'active/upcoming + last 7 days', count: 0, rows: [] },
  { tab: 'loot', window: 'active/upcoming + last 7 days', count: 0, rows: [] },
  { tab: 'audit-log', window: 'active/upcoming + last 7 days', count: 0, rows: [] },
];

/** Handle GET /api/boards: return JSON boards array shaped for board tabs. */
export function handleBoards(
  _req: { url: string | null },
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void;
    end: (body?: string) => void;
  },
): void {
  const response: BoardsResponse = {
    boards: BOARD_TABS.map((t) => ({ ...t })),
    count: BOARD_TABS.length,
    ts: Date.now(),
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}
