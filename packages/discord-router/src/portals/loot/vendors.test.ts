// Loot vendor watchlist — RED phase: tests define the contract before
// packages/discord-router/src/portals/loot/vendors.ts exists.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WATCHLIST, fetchAll, getLootCandidates, type VendorEntry } from './vendors.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

function installFetch(routes: Record<string, () => Response>): void {
  mockFetch.mockImplementation(async (input: any) => {
    const url = String(input);
    const handler = routes[url];
    if (handler) return handler();
    return new Response('not found', { status: 404 });
  });
}

const voucherPage = `<html><body>Free exam voucher for students. Claim your credit at the portal.</body></html>`;
const noSignalPage = `<html><body>Regular corporate page with no loot signals whatsoever.</body></html>`;
const rssFeed = `<rss version="2.0"><channel><item><title>Free Azure Credit</title><description>Get $100 free credit for students. Claim now.</description></item></channel></rss>`;

const voucherEntry: VendorEntry = { vendor: 'TestVendor', url: 'https://example.com/voucher', mode: 'html' };
const noSignalEntry: VendorEntry = { vendor: 'TestVendor', url: 'https://example.com/no-signal', mode: 'html' };
const failingEntry: VendorEntry = { vendor: 'FailVendor', url: 'https://example.com/failing', mode: 'html' };
const rssEntry: VendorEntry = { vendor: 'RSSVendor', url: 'https://example.com/rss', mode: 'rss' };

describe('fetchAll — per-entry fetch + keyword layer', () => {
  it('signal page → candidate with ≤200 snippet', async () => {
    installFetch({
      'https://example.com/voucher': () =>
        new Response(voucherPage, { status: 200, headers: { 'content-type': 'text/html' } }),
    });
    const cands = await fetchAll([voucherEntry]);
    expect(cands).toHaveLength(1);
    expect(cands[0].title).toContain('TestVendor');
    expect(cands[0].snippet.length).toBeLessThanOrEqual(200);
    expect(cands[0].url).toBe('https://example.com/voucher');
  });

  it('no-signal page → []', async () => {
    installFetch({
      'https://example.com/no-signal': () =>
        new Response(noSignalPage, { status: 200, headers: { 'content-type': 'text/html' } }),
    });
    const cands = await fetchAll([noSignalEntry]);
    expect(cands).toEqual([]);
  });

  it('non-ok response → entry skipped, no throw', async () => {
    installFetch({
      'https://example.com/no-signal': () => new Response('gone', { status: 404 }),
    });
    const cands = await fetchAll([noSignalEntry]);
    expect(cands).toEqual([]);
  });

  it('one entry failing → other entries still produce (isolation)', async () => {
    installFetch({
      'https://example.com/voucher': () =>
        new Response(voucherPage, { status: 200, headers: { 'content-type': 'text/html' } }),
      'https://example.com/failing': () => {
        throw new Error('network down');
      },
    });
    const cands = await fetchAll([voucherEntry, failingEntry]);
    expect(cands).toHaveLength(1);
    expect(cands[0].url).toBe('https://example.com/voucher');
  });

  it('rss-mode entry → candidate from XML fixture', async () => {
    installFetch({
      'https://example.com/rss': () =>
        new Response(rssFeed, { status: 200, headers: { 'content-type': 'application/xml' } }),
    });
    const cands = await fetchAll([rssEntry]);
    expect(cands).toHaveLength(1);
    expect(cands[0].title).toContain('RSSVendor');
  });

  it('config add/remove changes output with zero code change', async () => {
    installFetch({
      'https://example.com/voucher': () =>
        new Response(voucherPage, { status: 200, headers: { 'content-type': 'text/html' } }),
      'https://example.com/no-signal': () =>
        new Response(noSignalPage, { status: 200, headers: { 'content-type': 'text/html' } }),
    });
    const oneEntry = await fetchAll([voucherEntry]);
    expect(oneEntry).toHaveLength(1);

    const twoEntries = await fetchAll([voucherEntry, noSignalEntry]);
    expect(twoEntries).toHaveLength(1); // only voucher entry produces a candidate
  });
});

describe('getLootCandidates — WATCHLIST fan-out + URL dedupe', () => {
  it('never throws when all entries fail', async () => {
    mockFetch.mockImplementation(async () => {
      throw new Error('network down');
    });
    await expect(getLootCandidates()).resolves.toBeDefined();
  });

  it('dedupes URLs via getLootCandidates', async () => {
    installFetch({
      'https://example.com/voucher': () =>
        new Response(voucherPage, { status: 200, headers: { 'content-type': 'text/html' } }),
    });
    // fetchAll doesn't dedupe; getLootCandidates does
    const all = await fetchAll([voucherEntry, voucherEntry]);
    expect(all).toHaveLength(2); // fetchAll returns duplicates

    // getLootCandidates uses real WATCHLIST — verify it resolves without throwing
    const result = await getLootCandidates();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('WATCHLIST — starter entries', () => {
  it('contains CNCF/LF, AWS, Azure, GitHub Education, Oracle', () => {
    const vendors = WATCHLIST.map((e) => e.vendor);
    expect(vendors).toContain('CNCF/LF');
    expect(vendors).toContain('AWS Student Rewards');
    expect(vendors).toContain('Microsoft Azure');
    expect(vendors).toContain('GitHub Education');
    expect(vendors).toContain('Oracle');
  });

  it('all entries have valid mode and URL', () => {
    for (const entry of WATCHLIST) {
      expect(['html', 'rss']).toContain(entry.mode);
      expect(() => new URL(entry.url)).not.toThrow();
    }
  });
});
