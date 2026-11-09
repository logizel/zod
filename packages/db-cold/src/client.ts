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

/** Read all taste rules from the cold Turso ledger.
 *
 * The cold schema (infra/turso/schema.sql) has no `source` column and uses an
 * INTEGER PRIMARY KEY AUTOINCREMENT id; only the rule payload is mirrored.
 * Provenance (`source`) lives in the hot PocketBase taste_rules collection.
 */
export const LOOKUP_TASTE_RULES_SQL =
  'SELECT kind, rule, weight FROM taste_rules';

/** Taste rule write: insert-or-ignore so reruns never duplicate a rule.
 *
 * Dedup keys on the UNIQUE(kind, rule) index created by the cold schema; the
 * id is autoincrement and created_at is supplied by the writer.
 */
export const RECORD_TASTE_RULE_SQL =
  'INSERT OR IGNORE INTO taste_rules (kind, rule, weight, created_at) VALUES (?, ?, ?, ?)';

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

/** Taste rule payload mirrored in the cold Turso ledger. */
export interface ColdTasteRule {
  kind: string;
  rule: string;
  weight: number;
}

/** Read all taste rules from the cold ledger. */
export async function lookupTasteRules(
  db: StatementExecutor,
): Promise<ColdTasteRule[]> {
  const { rows } = await db.execute(LOOKUP_TASTE_RULES_SQL);
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      kind: String(record['kind']),
      rule: String(record['rule']),
      weight: Number(record['weight']),
    };
  });
}

/** Insert-or-ignore a taste rule into the cold ledger. */
export async function recordTasteRule(
  db: StatementExecutor,
  rule: ColdTasteRule,
): Promise<void> {
  await db.execute(RECORD_TASTE_RULE_SQL, [
    rule.kind,
    rule.rule,
    rule.weight,
    new Date().toISOString(),
  ]);
}
