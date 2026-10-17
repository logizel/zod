// Trim-predicate tests (MEM-02): old, boundary, and fresh fixtures.
import { describe, expect, it } from 'vitest';
import {
  isTelemetryExpired,
  TELEMETRY_RETENTION_MS,
  purgeExpiredHeavyText,
} from './telemetry.js';

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

describe('isTelemetryExpired', () => {
  it('flags rows strictly older than 24h (Date, ISO string, and epoch fixtures)', () => {
    const old = NOW - (24 * HOUR_MS + 1);
    expect(isTelemetryExpired(new Date(old), NOW)).toBe(true);
    expect(isTelemetryExpired(new Date(old).toISOString(), NOW)).toBe(true);
    expect(isTelemetryExpired(old, NOW)).toBe(true);
  });

  it('keeps the exact 24h boundary row (only strictly-older rows trim)', () => {
    const boundary = NOW - TELEMETRY_RETENTION_MS;
    expect(isTelemetryExpired(new Date(boundary), NOW)).toBe(false);
    expect(isTelemetryExpired(new Date(boundary).toISOString(), NOW)).toBe(false);
    expect(isTelemetryExpired(boundary, NOW)).toBe(false);
  });

  it('keeps fresh rows and future timestamps', () => {
    expect(isTelemetryExpired(new Date(NOW - HOUR_MS), NOW)).toBe(false);
    expect(isTelemetryExpired(new Date(NOW).toISOString(), NOW)).toBe(false);
    expect(isTelemetryExpired(NOW + HOUR_MS, NOW)).toBe(false);
  });

  it('throws loudly on unparseable timestamps instead of silently keeping', () => {
    expect(() => isTelemetryExpired('not-a-date', NOW)).toThrow(/unparseable/);
    expect(() => isTelemetryExpired(Number.NaN, NOW)).toThrow(/unparseable/);
  });
});

// ---------------------------------------------------------------------------
// MEM-05 midnight GC: purgeExpiredHeavyText (RED tests — implementation lands
// in the GREEN step below). Scope: description_raw (opportunities) and detail
// (agent_telemetry) heavy-text columns only; row metadata retained;
// tombstone_ledger + taste_rules never touched; idempotent.
// ---------------------------------------------------------------------------

describe('purgeExpiredHeavyText', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

  function oldRow(): { id: string; created: string; detail: string } {
    return {
      id: 'tel-old',
      created: new Date(NOW - (25 * HOUR_MS)).toISOString(), // 25h ago -> purge-eligible
      detail: 'heavy micro-step detail',
    };
  }
  function boundaryRow(): { id: string; created: string; detail: string } {
    return {
      id: 'tel-boundary',
      created: new Date(NOW - TELEMETRY_RETENTION_MS).toISOString(), // exactly 24h -> kept
      detail: 'kept detail',
    };
  }
  function freshRow(): { id: string; created: string; detail: string } {
    return {
      id: 'tel-fresh',
      created: new Date(NOW - 2 * HOUR_MS).toISOString(), // 2h ago -> kept
      detail: 'fresh detail',
    };
  }
  function oldOpp(): { id: string; end_date: string | null; description_raw: string; status: string } {
    return {
      id: 'opp-old',
      end_date: new Date(NOW - (25 * HOUR_MS)).toISOString(), // purge-eligible
      description_raw: 'heavy raw description',
      status: 'expired',
    };
  }
  function keptOpp(): { id: string; end_date: string | null; description_raw: string; status: string } {
    return {
      id: 'opp-kept',
      end_date: new Date(NOW - 2 * HOUR_MS).toISOString(), // kept
      description_raw: 'kept raw',
      status: 'candidate',
    };
  }

  it('clears detail on agent_telemetry rows older than 24h, keeps boundary/fresh', () => {
    const old = oldRow();
    const boundary = boundaryRow();
    const fresh = freshRow();
    const result = purgeExpiredHeavyText(
      { agentTelemetry: [old, boundary, fresh], opportunities: [] },
      NOW,
    );
    expect(result.purged).toBeGreaterThan(0);
    expect(old.detail).toBe(''); // cleared (older than 24h)
    expect(boundary.detail).toBe('kept detail'); // exactly-24h boundary kept
    expect(fresh.detail).toBe('fresh detail'); // fresh kept
  });

  it('clears description_raw on opportunities past end_date by 24h, keeps others', () => {
    const old = oldOpp();
    const kept = keptOpp();
    const result = purgeExpiredHeavyText(
      { agentTelemetry: [], opportunities: [old, kept] },
      NOW,
    );
    expect(result.purged).toBeGreaterThan(0);
    expect(old.description_raw).toBe(''); // cleared
    expect(kept.description_raw).toBe('kept raw'); // kept
    expect(kept.end_date).toBeDefined(); // metadata retained
  });

  it('is idempotent: re-running on already-purged rows is a no-op', () => {
    const old = oldRow();
    const opp = oldOpp();
    const first = purgeExpiredHeavyText(
      { agentTelemetry: [old], opportunities: [opp] },
      NOW,
    );
    const second = purgeExpiredHeavyText(
      { agentTelemetry: [old], opportunities: [opp] }, // same objects, now empty
      NOW,
    );
    expect(first.purged).toBeGreaterThan(0);
    expect(second.purged).toBe(0); // already empty -> nothing to purge
    expect(second.errors).toBe(0);
  });

  it('reports counts: purged, compacted, errors', () => {
    const result = purgeExpiredHeavyText(
      { agentTelemetry: [oldRow()], opportunities: [oldOpp()] },
      NOW,
    );
    expect(typeof result.purged).toBe('number');
    expect(typeof result.compacted).toBe('number');
    expect(typeof result.errors).toBe('number');
    expect(result.purged).toBeGreaterThanOrEqual(2); // one detail + one description_raw
  });
});
