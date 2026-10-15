// Fingerprint + two-tier precheck tests (D-12, MEM-01/MEM-03).
//
// Behavior contract from the plan:
//  1. identical inputs -> identical hex digests across repeated calls
//  2. tracking params / fragments / trailing slash / host casing normalize
//     equal; any normalized field change flips the digest
//  3. empty URL or title raises instead of hashing
//  4. precheck hits hot first (cold untouched), else exactly one keyed cold
//     lookup -> fresh | hot-hit | tombstoned
import { describe, expect, it } from 'vitest';
import { fingerprint, hashUrl, normalizeUrl } from './fingerprint.js';
import { precheck, type ColdStore, type HotStore } from './precheck.js';

const INPUT = {
  url: 'https://example.com/hackathon',
  title: 'Example Hackathon',
  date: '2026-11-01',
  organizer: 'Example Org',
};

describe('fingerprint stability (behavior 1)', () => {
  it('produces identical hex digests across repeated calls', () => {
    const first = fingerprint(INPUT);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(INPUT)).toBe(first);
    expect(fingerprint({ ...INPUT })).toBe(first);
  });
});

describe('URL normalization (behavior 2)', () => {
  const CANON = 'https://example.com/hackathon';

  it('normalizes host casing, tracking params, fragments, trailing slash', () => {
    expect(normalizeUrl('https://Example.COM/hackathon')).toBe(CANON);
    expect(normalizeUrl('https://example.com/hackathon/')).toBe(CANON);
    expect(normalizeUrl('https://example.com/hackathon#prizes')).toBe(CANON);
    expect(
      normalizeUrl('https://example.com/hackathon?utm_source=x&utm_medium=y'),
    ).toBe(CANON);
    expect(normalizeUrl('https://example.com/hackathon?fbclid=abc&gclid=123')).toBe(
      CANON,
    );
    expect(
      normalizeUrl('HTTPS://EXAMPLE.com/hackathon/?utm_campaign=z#top'),
    ).toBe(CANON);
  });

  it('keeps meaningful query params (only tracking noise is stripped)', () => {
    const withEdition = normalizeUrl('https://example.com/hack?edition=2026');
    expect(withEdition).not.toBe(CANON);
    expect(withEdition).toContain('edition=2026');
  });

  it('hashes equal for tracking-only URL differences', () => {
    const tracked = { ...INPUT, url: `${INPUT.url}?utm_source=newsletter#top` };
    expect(fingerprint(tracked)).toBe(fingerprint(INPUT));
  });

  it('flips the digest on any normalized field change', () => {
    const base = fingerprint(INPUT);
    expect(fingerprint({ ...INPUT, title: 'Other Hackathon' })).not.toBe(base);
    expect(fingerprint({ ...INPUT, date: '2026-12-01' })).not.toBe(base);
    expect(fingerprint({ ...INPUT, organizer: 'Other Org' })).not.toBe(base);
    expect(fingerprint({ ...INPUT, url: 'https://example.com/other' })).not.toBe(
      base,
    );
  });

  it('hashUrl is stable hex over the normalized URL', () => {
    expect(hashUrl(normalizeUrl('https://Example.com/x/'))).toMatch(/^[0-9a-f]{64}$/);
    expect(hashUrl(CANON)).toBe(hashUrl('https://example.com/hackathon'));
  });
});

describe('input validation (behavior 3)', () => {
  it('raises on empty or whitespace-only URL', () => {
    expect(() => fingerprint({ ...INPUT, url: '' })).toThrow();
    expect(() => fingerprint({ ...INPUT, url: '   ' })).toThrow();
  });

  it('raises on empty or whitespace-only title', () => {
    expect(() => fingerprint({ ...INPUT, title: '' })).toThrow();
    expect(() => fingerprint({ ...INPUT, title: '   ' })).toThrow();
  });
});

describe('two-tier precheck (behavior 4)', () => {
  const TRACKED_INPUT = { ...INPUT, url: `${INPUT.url}?utm_source=x#frag` };

  function stores(hit: boolean, tombstone: boolean): {
    hot: HotStore;
    cold: ColdStore & { calls: string[] };
  } {
    const calls: string[] = [];
    return {
      hot: { hasFingerprint: async () => hit },
      cold: {
        calls,
        findTombstone: async (urlHash: string) => {
          calls.push(urlHash);
          return tombstone
            ? { url_hash: urlHash, fingerprint: fingerprint(INPUT) }
            : null;
        },
      },
    };
  }

  it('returns hot-hit without touching cold on a hot fingerprint hit', async () => {
    const { hot, cold } = stores(true, false);
    await expect(precheck(TRACKED_INPUT, hot, cold)).resolves.toBe('hot-hit');
    expect(cold.calls).toHaveLength(0);
  });

  it('issues exactly one keyed cold lookup on a hot miss -> tombstoned', async () => {
    const { hot, cold } = stores(false, true);
    await expect(precheck(TRACKED_INPUT, hot, cold)).resolves.toBe('tombstoned');
    expect(cold.calls).toHaveLength(1);
    expect(cold.calls[0]).toBe(hashUrl(normalizeUrl(INPUT.url)));
  });

  it('returns fresh when neither store knows the URL', async () => {
    const { hot, cold } = stores(false, false);
    await expect(precheck(TRACKED_INPUT, hot, cold)).resolves.toBe('fresh');
    expect(cold.calls).toHaveLength(1);
  });
});
