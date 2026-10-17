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
  const ROW_OLD = {
    id: 'tel-old',
    created: new Date(NOW - (25 * 60 * 60 * 1000)).toISOString(), // 25h ago -> purge-eligible
    detail: 'heavy micro-step detail',
  };
  const ROW_BOUNDARY = {
    id: 'tel-boundary',
    created: new Date(NOW - TELEMETRY_RETENTION_MS).toISOString(), // exactly 24h -> kept
    detail: 'kept detail',
  };
  const ROW_FRESH = {
    id: 'tel-fresh',
    created: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), // 2h ago -> kept
    detail: 'fresh detail',
  };

  const OPP_OLD = {
    id: 'opp-old',
    end_date: new Date(NOW - (25 * 60 * 60 * 1000)).toISOString(), // purge-eligible
    description_raw: 'heavy raw description',
    status: 'expired',
  };
  const OPP_KEPT = {
    id: 'opp-kept',
    end_date: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), // kept
    description_raw: 'kept raw',
    status: 'candidate',
  };

  it('clears detail on agent_telemetry rows older than 24h, keeps boundary + fresh', () => {
    const result = purgeExpiredHeavyText(
      { agentTelemetry: [ROW_OLD, ROW_BOUNDARY, ROW_FRESH], opportunities: [] },
      NOW,
    );
    expect(result.purged).toBeGreaterThan(0);
    expect(ROW_OLD.detail).toBe(''); // cleared
    expect(ROW_BOUNDARY.detail).toBe('kept detail'); // boundary kept
    expect(ROW_FRESH.detail).toBe('fresh detail'); // fresh kept
  });

  it('clears description_raw on opportunities past end_date by 24h, keeps others', () => {
    const result = purgeExpiredHeavyText(
      { agentTelemetry: [], opportunities: [OPP_OLD, OPP_KEPT] },
      NOW,
    );
    expect(result.purged).toBeGreaterThan(0);
    expect(OPP_OLD.description_raw).toBe(''); // cleared
    expect(OPP_KEPT.description_raw).toBe('kept raw'); // kept
    expect(OPP_KEPT.end_date).toBeDefined(); // metadata retained
  });

  it('is idempotent: re-running on already-purged rows is a no-op', () => {
    const first = purgeExpiredHeavyText(
      { agentTelemetry: [ROW_OLD], opportunities: [OPP_OLD] },
      NOW,
    );
    const second = purgeExpiredHeavyText(
      { agentTelemetry: [ROW_OLD], opportunities: [OPP_OLD] },
      NOW,
    );
    expect(first.purged).toBeGreaterThan(0);
    expect(second.purged).toBe(0); // already empty -> nothing to purge
    expect(second.errors).toBe(0);
  });

  it('never touches tombstone_ledger or taste_rules (out of scope)', () => {
    // Those collections are not even passed to this function; assert by
    // confirming the function only clears description_raw/detail and nothing
    // else mutates rows.
    const result = purgeExpiredHeavyText(
      { agentTelemetry: [ROW_OLD], opportunities: [OPP_OLD] },
      NOW,
    );
    expect(result.purged).toBeGreaterThan(0);
    expect(ROW_OLD.id).toBe('tel-old'); // row identity retained
    expect(ROW_OLD.created).toBeDefined(); // created retained
    expect(OPP_OLD.id).toBe('opp-old'); // row identity retained
    expect(OPP_OLD.end_date).toBeDefined(); // end_date retained
  });

  it('reports counts: purged, compacted, errors', () => {
    const result = purgeExpiredHeavyText(
      { agentTelemetry: [ROW_OLD], opportunities: [OPP_OLD] },
      NOW,
    );
    expect(typeof result.purged).toBe('number');
    expect(typeof result.compacted).toBe('number');
    expect(typeof result.errors).toBe('number');
    expect(result.purged).toBeGreaterThanOrEqual(2); // one detail + one description_raw
  });
});
