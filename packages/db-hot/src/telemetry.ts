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
