// Boards endpoint tests (D-03, D-12): snapshot shape + board-window filter.

import { describe, expect, it } from 'vitest';
import { handleBoards, type BoardsResponse } from './boards.js';

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
    const parsed = JSON.parse(res.body!) as BoardsResponse;
    expect(Array.isArray(parsed.boards)).toBe(true);
    expect(parsed.count).toBe(parsed.boards.length);
    expect(typeof parsed.ts).toBe('number');
  });

  it('each board has tab, window, count, rows (D-09 tabbed layout)', () => {
    const res = mockResponse();
    handleBoards({ url: '/api/boards' } as never, res as never);
    const parsed = JSON.parse(res.body!) as BoardsResponse;
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
    const parsed = JSON.parse(res.body!) as BoardsResponse;
    for (const board of parsed.boards) {
      expect(board.window).toBe('active/upcoming + last 7 days');
    }
  });

  it('includes the expected tab set (events-local/travel/online, tba-queue, jobs-sys/general, loot, audit-log)', () => {
    const res = mockResponse();
    handleBoards({ url: '/api/boards' } as never, res as never);
    const parsed = JSON.parse(res.body!) as BoardsResponse;
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
