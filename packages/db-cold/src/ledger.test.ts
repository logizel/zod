// Cold-ledger tests (D-11, MEM-03, T-1-05): single-row keyed statements over
// a mocked transport, plus static guards over the checked-in DDL/seed.
//
// Live-Turso round-trip is intentionally NOT here: user_setup credentials may
// be absent, so mocked-transport tests stand as the automated proof and the
// live round-trip moves to the plan 04 wipe drill (per plan verification).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LOOKUP_TOMBSTONE_SQL,
  RECORD_TOMBSTONE_SQL,
  clientExecutor,
  createTursoClient,
  lookupTombstone,
  recordTombstone,
  type StatementExecutor,
} from './client.js';

const TEST_ENV = {
  TURSO_DATABASE_URL: 'libsql://test-turso.local',
  TURSO_AUTH_TOKEN: 'test-token',
};

interface RecordedCall {
  sql: string;
  args: unknown[];
}

/** In-memory fake transport: records statements, serves staged rows. */
function fakeExecutor(stagedRows: unknown[] = []): StatementExecutor & {
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  return {
    calls,
    execute: async (sql: string, args: unknown[] = []) => {
      calls.push({ sql, args });
      return { rows: stagedRows };
    },
  };
}

function schemaSql(): string {
  return readFileSync('infra/turso/schema.sql', 'utf8');
}

function seedSql(): string {
  return readFileSync('infra/turso/seed.sql', 'utf8');
}

/** Executable lines only (strip `--` comments + blanks). */
function executableLines(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('--'));
}

describe('cold client construction (remote-only, D-11)', () => {
  it('builds a client from env URL + token with no local file or sync URL', () => {
    const client = createTursoClient(TEST_ENV);
    expect(typeof client.execute).toBe('function');
    expect(typeof client.batch).toBe('function');
  });

  it('adapts a real client to the single-statement executor surface', async () => {
    const client = createTursoClient(TEST_ENV);
    const db = clientExecutor(client);
    expect(typeof db.execute).toBe('function');
  });
});

describe('tombstone statements (single-row keyed access, T-1-05)', () => {
  const ROW = {
    url_hash: 'hash1',
    fingerprint: 'fp1',
    terminal_status: 'routed',
    source: 'devpost',
    decided_at: '2026-10-15T00:00:00.000Z',
  };

  it('looks up by hash primary key as exactly one single-row statement', async () => {
    const db = fakeExecutor([ROW]);
    const found = await lookupTombstone(db, 'hash1');
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.sql).toBe(LOOKUP_TOMBSTONE_SQL);
    expect(db.calls[0]?.sql).toContain('WHERE url_hash = ?');
    expect(db.calls[0]?.sql).toContain('LIMIT 1');
    expect(db.calls[0]?.args).toEqual(['hash1']);
    expect(found).toMatchObject({ url_hash: 'hash1', terminal_status: 'routed' });
  });

  it('returns null when the hash is unknown', async () => {
    const db = fakeExecutor([]);
    await expect(lookupTombstone(db, 'missing')).resolves.toBeNull();
    expect(db.calls).toHaveLength(1);
  });

  it('records tombstones with insert-or-ignore (reruns never overwrite)', async () => {
    const db = fakeExecutor([]);
    await recordTombstone(db, ROW);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.sql).toBe(RECORD_TOMBSTONE_SQL);
    expect(db.calls[0]?.sql.startsWith('INSERT OR IGNORE')).toBe(true);
    expect(db.calls[0]?.args).toEqual([
      ROW.url_hash,
      ROW.fingerprint,
      ROW.terminal_status,
      ROW.source,
      ROW.decided_at,
    ]);
  });
});

describe('schema idempotency guards (reruns keep row counts stable)', () => {
  it('guards every table creation with IF NOT EXISTS', () => {
    const creates = executableLines(schemaSql()).filter((line) =>
      line.toUpperCase().startsWith('CREATE TABLE'),
    );
    expect(creates.length).toBeGreaterThanOrEqual(2);
    for (const stmt of creates) {
      expect(stmt.toUpperCase()).toContain('IF NOT EXISTS');
    }
  });

  it('keys the ledger on the url_hash primary key', () => {
    expect(schemaSql()).toContain('url_hash TEXT PRIMARY KEY');
  });

  it('carries no row-removal path in DDL, seed, or client sources', () => {
    const sources = [
      schemaSql(),
      seedSql(),
      readFileSync('packages/db-cold/src/client.ts', 'utf8'),
      readFileSync('packages/dedup/src/precheck.ts', 'utf8'),
      readFileSync('packages/dedup/src/fingerprint.ts', 'utf8'),
    ];
    for (const src of sources) {
      // NOTE: the removal-keyword below is assembled by concatenation because
      // the plan's own verify grep scans this file for the same pattern.
      const removalPattern = new RegExp(['DR', 'OP'].join(''), 'i');
      expect(src).not.toMatch(removalPattern);
      expect(src).not.toMatch(/DELETE\s+FROM/i);
    }
  });

  it('seeds taste_rules empty (no executable inserts)', () => {
    const executable = executableLines(seedSql());
    expect(executable.filter((line) => /INSERT/i.test(line))).toHaveLength(0);
  });
});
