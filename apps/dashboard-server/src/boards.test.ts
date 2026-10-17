// Boards endpoint tests (D-03, D-10, D-12): snapshot shape, board-window filter,
// and rich combined filters (date range, channel, status, prize range,
// free-text, combined AND).

import { describe, expect, it } from 'vitest';
import { handleBoards, handleAuditOlder, lookupTombstone, type StatementExecutor } from './boards.js';

function mockResponse(): {
  statusCode: number;
  headers: Record<string, string>;
  body: string | undefined;
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (body?: string) => void;
} {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let body: string | undefined;
  return {
    get statusCode() {
      return statusCode;
    },
    get headers() {
      return headers;
    },
    get body() {
      return body;
    },
    writeHead: (status: number, h: Record<string, string>) => {
      statusCode = status;
      Object.assign(headers, h);
    },
    end: (b?: string) => {
      body = b;
    },
  };
}

function callBoards(url: string, rows: Record<string, unknown>[] = []): string {
  const res = mockResponse();
  handleBoards({ url } as never, res as never, { rows } as never);
  return res.body!;
}

function boardRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fingerprint_hash: 'fp-1',
    url_hash: 'url-1',
    pipeline: 'events',
    bucket_channel: '#-online-1lakh-plus',
    status: 'audited',
    title: 'Hackathon 2026',
    organizer: 'Tech Org',
    links: { official: 'https://example.com' },
    prize_cash_inr: 150000,
    prize_text: '₹1,50,000',
    deadlines: { tba: false, apply_by: '2026-11-01T00:00:00Z', event_start: '2026-11-01T00:00:00Z', event_end: '2026-11-02T00:00:00Z' },
    end_date: '2026-11-02T00:00:00Z',
    reminders: [],
    bookmark: false,
    audit_summary: '',
    description_raw: '',
    ...overrides,
  } as Record<string, unknown>;
}

// Count unique rows across all tabs (a row can match multiple tab scopes).
function uniqueRows(parsed: { boards: Array<{ rows: unknown[] }> }): unknown[] {
  const all = parsed.boards.flatMap((b) => b.rows);
  const seen = new Set<string>();
  return all.filter((r) => {
    const row = r as Record<string, unknown>;
    const key = JSON.stringify({
      url_hash: row.url_hash,
      end_date: row.end_date,
      status: row.status,
      title: row.title,
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

describe('GET /api/boards', () => {
  it('returns 200 with Content-Type application/json', () => {
    const res = mockResponse();
    handleBoards({ url: '/api/boards' } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(res.body).toBeDefined();
  });

  it('returns a JSON boards array shaped for board tabs', () => {
    const res = mockResponse();
    handleBoards({ url: '/api/boards' } as never, res as never);
    const parsed = JSON.parse(res.body!) as { boards: unknown[]; count: number; ts: number };
    expect(Array.isArray(parsed.boards)).toBe(true);
    expect(parsed.count).toBe(0);
    expect(typeof parsed.ts).toBe('number');
    expect(parsed.boards.length).toBe(8);
  });

  it('each board has tab, window, count, rows (D-09 tabbed layout)', () => {
    const res = mockResponse();
    handleBoards({ url: '/api/boards' } as never, res as never);
    const parsed = JSON.parse(res.body!) as { boards: unknown[] };
    for (const board of parsed.boards) {
      expect(board).toHaveProperty('tab');
      expect(board).toHaveProperty('window');
      expect(board).toHaveProperty('count');
      expect(board).toHaveProperty('rows');
      expect(typeof board.count).toBe('number');
      expect(Array.isArray(board.rows)).toBe(true);
    }
  });

  it('board-window filter: active/upcoming + last 7 days (D-12)', () => {
    const res = mockResponse();
    handleBoards({ url: '/api/boards' } as never, res as never);
    const parsed = JSON.parse(res.body!) as { boards: Array<{ window: string }> };
    for (const board of parsed.boards) {
      expect(board.window).toBe('active/upcoming + last 7 days');
    }
  });

  it('includes the expected tab set (events-local/travel/online, tba-queue, jobs-sys/general, loot, audit-log)', () => {
    const res = mockResponse();
    handleBoards({ url: '/api/boards' } as never, res as never);
    const parsed = JSON.parse(res.body!) as { boards: Array<{ tab: string }> };
    const tabs = parsed.boards.map((b) => b.tab).sort();
    expect(tabs).toEqual([
      'audit-log',
      'events-local',
      'events-online',
      'events-travel',
      'jobs-general',
      'jobs-sys',
      'loot',
      'tba-queue',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Combined filter tests (D-10): date range, channel, status, prize range,
// free-text, combined AND — rows passed in via callBoards rows param
// ---------------------------------------------------------------------------

describe('GET /api/boards combined filters (D-10)', () => {
  it('start_date filter excludes rows ending before the range', () => {
    const rows = [boardRow({ end_date: '2026-09-01T00:00:00Z' }), boardRow({ end_date: '2026-10-20T00:00:00Z' })];
    const body = callBoards('/api/boards?start_date=2026-10-01T00:00:00Z', rows);
    const parsed = JSON.parse(body) as { boards: Array<{ rows: unknown[] }> };
    expect(uniqueRows(parsed).length).toBe(1);
    expect(uniqueRows(parsed)[0].end_date).toBe('2026-10-20T00:00:00Z');
  });

  it('end_date filter excludes rows ending after the range', () => {
    const rows = [boardRow({ end_date: '2026-10-10T00:00:00Z' }), boardRow({ end_date: '2026-10-30T00:00:00Z' })];
    const body = callBoards('/api/boards?end_date=2026-10-20T00:00:00Z', rows);
    const parsed = JSON.parse(body) as { boards: Array<{ rows: unknown[] }> };
    expect(uniqueRows(parsed).length).toBe(1);
    expect(uniqueRows(parsed)[0].end_date).toBe('2026-10-10T00:00:00Z');
  });

  it('channel filter returns only matching bucket_channel rows', () => {
    const rows = [boardRow({ bucket_channel: '#-online-1lakh-plus' }), boardRow({ bucket_channel: '#-travel-events' })];
    const body = callBoards('/api/boards?channel=%23-online-1lakh-plus', rows);
    const parsed = JSON.parse(body) as { boards: Array<{ rows: unknown[] }> };
    expect(uniqueRows(parsed).length).toBe(1);
    expect(uniqueRows(parsed)[0].bucket_channel).toBe('#-online-1lakh-plus');
  });

  it('status filter returns only matching status rows', () => {
    const rows = [boardRow({ status: 'audited' }), boardRow({ status: 'rejected' })];
    const body = callBoards('/api/boards?status=audited', rows);
    const parsed = JSON.parse(body) as { boards: Array<{ rows: unknown[] }> };
    expect(uniqueRows(parsed).length).toBe(1);
    expect(uniqueRows(parsed)[0].status).toBe('audited');
  });

  it('prize_min filter excludes rows below the minimum', () => {
    const rows = [boardRow({ prize_cash_inr: 50000 }), boardRow({ prize_cash_inr: 150000 })];
    const body = callBoards('/api/boards?prize_min=100000', rows);
    const parsed = JSON.parse(body) as { boards: Array<{ rows: unknown[] }> };
    expect(uniqueRows(parsed).length).toBe(1);
    expect(uniqueRows(parsed)[0].prize_cash_inr).toBe(150000);
  });

  it('prize_max filter excludes rows above the maximum', () => {
    const rows = [boardRow({ prize_cash_inr: 50000 }), boardRow({ prize_cash_inr: 150000 })];
    const body = callBoards('/api/boards?prize_max=100000', rows);
    const parsed = JSON.parse(body) as { boards: Array<{ rows: unknown[] }> };
    expect(uniqueRows(parsed).length).toBe(1);
    expect(uniqueRows(parsed)[0].prize_cash_inr).toBe(50000);
  });

  it('free-text q matches title or organizer case-insensitive', () => {
    const rows = [boardRow({ title: 'Hackathon 2026', organizer: 'Tech Org' }), boardRow({ title: 'Job Fair', organizer: 'Hiring Co' })];
    const body = callBoards('/api/boards?q=hackathon', rows);
    const parsed = JSON.parse(body) as { boards: Array<{ rows: unknown[] }> };
    expect(uniqueRows(parsed).length).toBe(1);
    expect(uniqueRows(parsed)[0].title).toBe('Hackathon 2026');
  });

  it('combined AND: date + channel + status + prize + q all applied together', () => {
    const rows = [
      boardRow({ end_date: '2026-10-20T00:00:00Z', bucket_channel: '#-online-1lakh-plus', status: 'audited', prize_cash_inr: 150000, title: 'Hackathon 2026' }),
      boardRow({ end_date: '2026-10-20T00:00:00Z', bucket_channel: '#-travel-events', status: 'audited', prize_cash_inr: 150000, title: 'Travel Conf' }),
      boardRow({ end_date: '2026-09-01T00:00:00Z', bucket_channel: '#-online-1lakh-plus', status: 'audited', prize_cash_inr: 150000, title: 'Old Event' }),
    ];
    const body = callBoards(
      '/api/boards?start_date=2026-10-01T00:00:00Z&channel=%23-online-1lakh-plus&status=audited&prize_min=100000&q=hackathon',
      rows,
    );
    const parsed = JSON.parse(body) as { boards: Array<{ rows: unknown[] }> };
    expect(uniqueRows(parsed).length).toBe(1);
    expect(uniqueRows(parsed)[0].title).toBe('Hackathon 2026');
  });

  it('invalid status parameter is rejected with 400 (T-07-05)', () => {
    const res = mockResponse();
    handleBoards({ url: '/api/boards?status=not-a-status' } as never, res as never, { rows: [] } as never);
    expect(res.statusCode).toBe(400);
    expect(res.headers['Content-Type']).toBe('application/json');
    const parsed = JSON.parse(res.body!);
    expect(parsed.error).toBe('invalid filter parameters');
  });

  it('board window: active/upcoming statuses always in window (D-12)', () => {
    const rows = [boardRow({ status: 'candidate' }), boardRow({ status: 'routed' }), boardRow({ status: 'expired', end_date: '2026-01-01T00:00:00Z' })];
    const body = callBoards('/api/boards', rows);
    const parsed = JSON.parse(body) as { boards: Array<{ rows: unknown[] }> };
    const all = uniqueRows(parsed);
    expect(all.map((r) => (r as Record<string, unknown>).status).sort()).toEqual(['candidate', 'routed']);
  });
});

// ---------------------------------------------------------------------------
// Audit log "load older" — Turso tombstone_ledger point lookup (D-11, T-07-06)
// ---------------------------------------------------------------------------

function makeFakeDb(rows: unknown[]): StatementExecutor {
  return {
    execute: async (_sql: string, args?: unknown[]) => ({ rows }),
  };
}

describe('GET /api/audit/older (D-11)', () => {
  it('returns tombstone from cold ledger by url_hash point lookup', async () => {
    const res = mockResponse();
    const db = makeFakeDb([{
      url_hash: 'abc123',
      fingerprint: 'fp-abc',
      terminal_status: 'rejected',
      source: 'scout-events',
      decided_at: '2026-10-15T10:00:00Z',
    }]);
    await handleAuditOlder({ url: '/api/audit/older?url_hash=abc123' } as never, res as never, { db } as never);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body!);
    expect(parsed.tombstone).toMatchObject({
      url_hash: 'abc123',
      terminal_status: 'rejected',
      source: 'scout-events',
    });
  });

  it('returns null tombstone when hash is unknown', async () => {
    const res = mockResponse();
    const db = makeFakeDb([]);
    await handleAuditOlder({ url: '/api/audit/older?url_hash=unknown' } as never, res as never, { db } as never);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body!);
    expect(parsed.tombstone).toBeNull();
  });

  it('rejects missing url_hash with 400', async () => {
    const res = mockResponse();
    const db = makeFakeDb([]);
    await handleAuditOlder({ url: '/api/audit/older' } as never, res as never, { db } as never);
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body!);
    expect(parsed.error).toBe('url_hash required');
  });

  it('lookupTombstone returns null for empty rows', async () => {
    const db = makeFakeDb([]);
    const result = await lookupTombstone(db, 'anything');
    expect(result).toBeNull();
  });

  it('lookupTombstone maps row to ColdTombstone', async () => {
    const db = makeFakeDb([{
      url_hash: 'xyz',
      fingerprint: 'fp-xyz',
      terminal_status: 'tombstoned',
      source: 'scout-local',
      decided_at: '2026-10-16T08:00:00Z',
    }]);
    const result = await lookupTombstone(db, 'xyz');
    expect(result).toMatchObject({
      url_hash: 'xyz',
      terminal_status: 'tombstoned',
      source: 'scout-local',
    });
  });
});
