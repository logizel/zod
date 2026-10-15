// Turso cold client (D-11, MEM-03, T-1-05): remote-only ledger access.
//
// `createClient({url, authToken})` only — no local file path, no sync URL,
// no embedded replica in v1. Tombstone rows are written with INSERT OR IGNORE
// and read by hash-primary-key point lookup; this module exposes no
// statement that removes or replaces ledger rows.

import { createClient, type Client } from '@libsql/client';
import type { Env } from '@zod/config';

export type ColdEnv = Pick<Env, 'TURSO_DATABASE_URL' | 'TURSO_AUTH_TOKEN'>;

export interface ColdTombstone {
  url_hash: string;
  fingerprint: string;
  terminal_status: string;
  source: string;
  decided_at: string;
}

/** Minimal executor surface: the real client adapts to this; tests fake it. */
export interface StatementExecutor {
  execute(sql: string, args?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Single-row tombstone point lookup by hash primary key. */
export const LOOKUP_TOMBSTONE_SQL =
  'SELECT url_hash, fingerprint, terminal_status, source, decided_at FROM tombstone_ledger WHERE url_hash = ? LIMIT 1';

/** Tombstone write: insert-or-ignore so reruns never overwrite a verdict. */
export const RECORD_TOMBSTONE_SQL =
  'INSERT OR IGNORE INTO tombstone_ledger (url_hash, fingerprint, terminal_status, source, decided_at) VALUES (?, ?, ?, ?, ?)';

/** Remote-only construction from env URL + token. */
export function createTursoClient(env: ColdEnv): Client {
  return createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}

/** Adapt a live client to the single-statement executor surface. */
export function clientExecutor(client: Client): StatementExecutor {
  return {
    execute: async (sql: string, args: unknown[] = []) => {
      const result = await client.execute(sql, args as never);
      return { rows: result.rows as unknown[] };
    },
  };
}

function asTombstone(row: unknown): ColdTombstone {
  const record = row as Record<string, unknown>;
  return {
    url_hash: String(record['url_hash']),
    fingerprint: String(record['fingerprint']),
    terminal_status: String(record['terminal_status']),
    source: String(record['source'] ?? ''),
    decided_at: String(record['decided_at']),
  };
}

/** Exactly one keyed statement; null when the hash is unknown. */
export async function lookupTombstone(
  db: StatementExecutor,
  urlHash: string,
): Promise<ColdTombstone | null> {
  const { rows } = await db.execute(LOOKUP_TOMBSTONE_SQL, [urlHash]);
  if (rows.length === 0) return null;
  return asTombstone(rows[0]);
}

/** Single insert-or-ignore statement; never overwrites an existing verdict. */
export async function recordTombstone(
  db: StatementExecutor,
  tombstone: ColdTombstone,
): Promise<void> {
  await db.execute(RECORD_TOMBSTONE_SQL, [
    tombstone.url_hash,
    tombstone.fingerprint,
    tombstone.terminal_status,
    tombstone.source,
    tombstone.decided_at,
  ]);
}
