// Trim-predicate tests (MEM-02): old, boundary, and fresh fixtures.
import { describe, expect, it } from 'vitest';
import { isTelemetryExpired, TELEMETRY_RETENTION_MS } from './telemetry.js';

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
