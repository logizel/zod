// Two-tier pre-scrape check (D-12, MEM-01/MEM-03): hot PB fingerprint
// equality first, then exactly one keyed cold-ledger lookup by url_hash.
//
// Verdicts: hot-hit (seen live), tombstoned (decided before, skip without
// re-audit), fresh (unseen — proceed to scrape). Both lookups are single-row
// point reads; this module carries no write and no row-removal path.

import {
  fingerprint,
  hashUrl,
  normalizeUrl,
  type FingerprintInput,
} from './fingerprint.js';

export type PrecheckVerdict = 'fresh' | 'hot-hit' | 'tombstoned';

/** Hot-store port: single-row fingerprint-equality read (localhost PB). */
export interface HotStore {
  hasFingerprint(fingerprint: string): Promise<boolean>;
}

/** Cold-store port: single-row hash-primary-key read (Turso ledger). */
export interface ColdTombstone {
  url_hash: string;
  fingerprint: string;
}

export interface ColdStore {
  findTombstone(urlHash: string): Promise<ColdTombstone | null>;
}

/**
 * Consult hot storage first, then the cold ledger by single-row key lookup.
 * A hot hit returns before the cold store is ever touched.
 */
export async function precheck(
  input: FingerprintInput,
  hot: HotStore,
  cold: ColdStore,
): Promise<PrecheckVerdict> {
  const digest = fingerprint(input);
  if (await hot.hasFingerprint(digest)) {
    return 'hot-hit';
  }
  const urlHash = hashUrl(normalizeUrl(input.url));
  const tombstone = await cold.findTombstone(urlHash);
  return tombstone === null ? 'fresh' : 'tombstoned';
}
