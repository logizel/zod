// Production adapters for the two-tier dedup ports.
//
// The dedup package intentionally owns only structural ports. This module is
// the composition layer that binds them to the real hot (PocketBase) and cold
// (Turso) stores, so runStubTick can do a real precheck before any fetch.
//
// Cold degradation: the Turso ledger is the durable, VM-rebuild-surviving
// store. If its credentials/network are unavailable at runtime, the adapter
// falls back to the PocketBase tombstone mirror and logs once. The fallback
// keeps the local pipeline honest (no duplicate audits) while making the
// misconfiguration visible; it is not a substitute for fixing Turso.

import {
  lookupTombstone,
  recordTombstone,
  type ColdTombstone,
  type StatementExecutor,
} from '@zod/db-cold';

type HotCollection = {
  getFirstListItem(filter: string, options?: unknown): Promise<unknown>;
  create(data: Record<string, unknown>): Promise<unknown>;
};

export type HotPb = {
  collection(name: string): HotCollection;
};

export type ColdRow = {
  url_hash: string;
  fingerprint: string;
  terminal_status: string;
  source: string;
  decided_at: string;
};

function isNotFound(err: unknown): boolean {
  const e = err as { status?: number; response?: { code?: number; status?: number } } | null;
  const status = e?.status ?? e?.response?.code ?? e?.response?.status;
  return status === 404;
}

function isColdUnavailable(err: unknown): boolean {
  const message = String((err as { message?: unknown } | null)?.message ?? err);
  return /\b401\b|unauthorized|invalid jwt|fetch failed|econn|enotfound|network/i.test(
    message,
  );
}

function escapeFilter(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Hot-store port backed by PocketBase.
 *
 * Checks both the live opportunities table and the hot tombstone mirror. The
 * tombstone check keeps rejected candidates from being re-audited even when
 * the cold ledger is temporarily unreachable.
 */
export function createHotStore(pb: HotPb): {
  hasFingerprint(fingerprint: string): Promise<boolean>;
} {
  return {
    async hasFingerprint(fingerprint: string): Promise<boolean> {
      const escaped = escapeFilter(fingerprint);
      const checks: Array<{ collection: string; field: string }> = [
        { collection: 'opportunities', field: 'fingerprint_hash' },
        { collection: 'tombstone_ledger', field: 'fingerprint' },
      ];

      for (const check of checks) {
        try {
          await pb.collection(check.collection).getFirstListItem(
            `${check.field} = '${escaped}'`,
          );
          return true;
        } catch (err) {
          if (!isNotFound(err)) throw err;
        }
      }
      return false;
    },
  };
}

async function findHotTombstone(
  pb: HotPb,
  urlHash: string,
): Promise<ColdTombstone | null> {
  try {
    const row = (await pb
      .collection('tombstone_ledger')
      .getFirstListItem(`url_hash = '${escapeFilter(urlHash)}'`)) as Record<string, unknown>;
    return {
      url_hash: String(row['url_hash']),
      fingerprint: String(row['fingerprint']),
      terminal_status: String(row['terminal_status']),
      source: String(row['source'] ?? ''),
      decided_at: String(row['decided_at']),
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Cold-store port backed by the Turso tombstone ledger.
 *
 * `findTombstone` is the precheck read; `create` is the write used by the
 * intake merger and listing-screen rejection paths. On an auth/network
 * outage the adapter switches to the PocketBase mirror for the rest of the
 * process lifetime and calls `onDegraded` exactly once.
 */
export function createColdStore(
  db: StatementExecutor,
  pb?: HotPb,
  onDegraded?: (err: unknown) => void,
): {
  findTombstone(urlHash: string): Promise<ColdTombstone | null>;
  create(row: ColdRow): Promise<void>;
} {
  let degraded = false;

  const degrade = (err: unknown): void => {
    if (degraded) return;
    degraded = true;
    onDegraded?.(err);
  };

  return {
    async findTombstone(urlHash: string): Promise<ColdTombstone | null> {
      if (degraded) {
        return pb ? findHotTombstone(pb, urlHash) : null;
      }
      try {
        return await lookupTombstone(db, urlHash);
      } catch (err) {
        if (!isColdUnavailable(err)) throw err;
        degrade(err);
        return pb ? findHotTombstone(pb, urlHash) : null;
      }
    },

    async create(row: ColdRow): Promise<void> {
      if (degraded) {
        if (pb) await pb.collection('tombstone_ledger').create(row);
        return;
      }
      try {
        await recordTombstone(db, row);
      } catch (err) {
        if (!isColdUnavailable(err)) throw err;
        degrade(err);
        if (pb) await pb.collection('tombstone_ledger').create(row);
      }
    },
  };
}
