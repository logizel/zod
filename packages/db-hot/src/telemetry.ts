// Telemetry 24h trim predicate (MEM-02, D-15).
//
// agent_telemetry is a ring: rows STRICTLY OLDER than 24h are trim-eligible,
// everything else (including exactly-24h boundary rows) is kept. Phase 7
// midnight GC calls this predicate; the hot client never deletes directly.

/** Retention window for agent_telemetry rows: 24 hours in milliseconds. */
export const TELEMETRY_RETENTION_MS = 24 * 60 * 60 * 1000;

export type TelemetryTimestamp = string | number | Date;

function toEpochMs(created: TelemetryTimestamp): number {
  if (created instanceof Date) return created.getTime();
  if (typeof created === 'number') return created;
  return Date.parse(created);
}

/**
 * True when a telemetry row is trim-eligible (created strictly more than
 * 24h before `nowMs`). Throws on unparseable timestamps — trim decisions
 * stay loud, never silently kept or dropped.
 */
export function isTelemetryExpired(
  created: TelemetryTimestamp,
  nowMs: number = Date.now(),
): boolean {
  const createdMs = toEpochMs(created);
  if (!Number.isFinite(createdMs)) {
    throw new Error(`isTelemetryExpired: unparseable created timestamp: ${String(created)}`);
  }
  return nowMs - createdMs > TELEMETRY_RETENTION_MS;
}

// ---------------------------------------------------------------------------
// MEM-05 midnight GC: heavy-text purge (stub — implementation lands below)
// ---------------------------------------------------------------------------

export interface TelemetryRow {
  id: string;
  created: string;
  detail: string;
}

export interface OpportunityRow {
  id: string;
  end_date: string | null;
  description_raw: string;
}

export interface PurgeResult {
  purged: number; // heavy-text cells cleared
  compacted: number; // rows visited that were purge-eligible
  errors: number; // rows that threw during expiry evaluation
}

/**
 * Purge-eligible heavy-text columns only: `detail` on agent_telemetry rows
 * older than TELEMETRY_RETENTION_MS, and `description_raw` on opportunities
 * whose end_date is older than TELEMETRY_RETENTION_MS. Row metadata (id,
 * created, status, end_date) is retained. tombstone_ledger and taste_rules
 * are never touched by this function. Idempotent: re-running on already
 * purged rows is a no-op (clearing an already-empty string is a no-op).
 */
export function purgeExpiredHeavyText(
  rows: { agentTelemetry: TelemetryRow[]; opportunities: OpportunityRow[] },
  nowMs: number = Date.now(),
): PurgeResult {
  let purged = 0; // heavy-text cells cleared
  let compacted = 0; // rows visited that were purge-eligible
  let errors = 0; // rows that threw during expiry evaluation

  for (const row of rows.agentTelemetry) {
    let expired = false;
    try {
      expired = isTelemetryExpired(row.created, nowMs);
    } catch {
      errors += 1;
      continue;
    }
    if (expired && row.detail !== '') {
      row.detail = '';
      purged += 1;
      compacted += 1;
    } else if (expired) {
      compacted += 1;
    }
  }

  for (const row of rows.opportunities) {
    if (row.end_date == null) continue;
    let expired = false;
    try {
      expired = isTelemetryExpired(row.end_date, nowMs);
    } catch {
      errors += 1;
      continue;
    }
    if (expired && row.description_raw !== '') {
      row.description_raw = '';
      purged += 1;
      compacted += 1;
    } else if (expired) {
      compacted += 1;
    }
  }

  return { purged, compacted, errors };
}
