// D-06 fellowship allowlist config — RED phase: tests define the contract
// before packages/config/src/jobs-policy.ts exists.

import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_FELLOWSHIP_ALLOWLIST,
  resolveFellowshipAllowlist,
  getFellowshipAllowlist,
} from './jobs-policy.js';

// ---------------------------------------------------------------------------
// Default allowlist (D-06)
// ---------------------------------------------------------------------------

describe('DEFAULT_FELLOWSHIP_ALLOWLIST', () => {
  it('contains the core fellowship programs LFX, GSOC, MLH', () => {
    expect(DEFAULT_FELLOWSHIP_ALLOWLIST).toContain('LFX');
    expect(DEFAULT_FELLOWSHIP_ALLOWLIST).toContain('GSOC');
    expect(DEFAULT_FELLOWSHIP_ALLOWLIST).toContain('MLH');
  });

  it('is non-empty and all entries are uppercase strings', () => {
    expect(DEFAULT_FELLOWSHIP_ALLOWLIST.length).toBeGreaterThan(0);
    for (const name of DEFAULT_FELLOWSHIP_ALLOWLIST) {
      expect(typeof name).toBe('string');
      expect(name).toBe(name.toUpperCase());
      expect(name.trim()).toBe(name);
    }
  });

  it('has no duplicates', () => {
    const uniq = new Set(DEFAULT_FELLOWSHIP_ALLOWLIST);
    expect(uniq.size).toBe(DEFAULT_FELLOWSHIP_ALLOWLIST.length);
  });
});

// ---------------------------------------------------------------------------
// resolveFellowshipAllowlist — normalize + dedupe + filter
// ---------------------------------------------------------------------------

describe('resolveFellowshipAllowlist', () => {
  it('returns the default set when no extra is provided', () => {
    const result = resolveFellowshipAllowlist();
    expect(result).toEqual(expect.arrayContaining(['LFX', 'GSOC', 'MLH']));
  });

  it('normalizes: trims whitespace and uppercases', () => {
    const result = resolveFellowshipAllowlist('  lfx ,  gsoc  ');
    expect(result).toContain('LFX');
    expect(result).toContain('GSoC'.toUpperCase());
  });

  it('dedupes across defaults and extra', () => {
    const result = resolveFellowshipAllowlist('LFX, lfx, GSoC');
    const lfxCount = result.filter((n) => n === 'LFX').length;
    expect(lfxCount).toBe(1);
  });

  it('filters empty entries from extra CSV', () => {
    const result = resolveFellowshipAllowlist(', , LFX, ,');
    expect(result).toContain('LFX');
    expect(result.every((n) => n.length > 0)).toBe(true);
  });

  it('appends new programs without touching defaults', () => {
    const result = resolveFellowshipAllowlist('Outreachy');
    expect(result).toContain('LFX');
    expect(result).toContain('GSOC');
    expect(result).toContain('MLH');
    expect(result).toContain('OUTREACHY');
  });
});

// ---------------------------------------------------------------------------
// getFellowshipAllowlist — merges FELLOWSHIP_ALLOWLIST_EXTRA env
// ---------------------------------------------------------------------------

describe('getFellowshipAllowlist', () => {
  const origEnv = process.env.FELLOWSHIP_ALLOWLIST_EXTRA;

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.FELLOWSHIP_ALLOWLIST_EXTRA;
    } else {
      process.env.FELLOWSHIP_ALLOWLIST_EXTRA = origEnv;
    }
  });

  it('returns defaults when FELLOWSHIP_ALLOWLIST_EXTRA is unset', () => {
    delete process.env.FELLOWSHIP_ALLOWLIST_EXTRA;
    const result = getFellowshipAllowlist();
    expect(result).toEqual(expect.arrayContaining(['LFX', 'GSOC', 'MLH']));
  });

  it('appends env-extra programs without code change', () => {
    process.env.FELLOWSHIP_ALLOWLIST_EXTRA = 'Outreachy, Thiel Fellowship';
    const result = getFellowshipAllowlist();
    expect(result).toContain('OUTREACHY');
    expect(result).toContain('THIEL FELLOWSHIP');
    expect(result).toContain('LFX');
  });

  it('normalizes and dedupes env-extra entries', () => {
    process.env.FELLOWSHIP_ALLOWLIST_EXTRA = 'lfx, outreachy, OUTREACHY';
    const result = getFellowshipAllowlist();
    const outreachyCount = result.filter((n) => n === 'OUTREACHY').length;
    expect(outreachyCount).toBe(1);
    expect(result).toContain('LFX');
  });
});
