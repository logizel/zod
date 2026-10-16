// Loot FAQ reader — RED phase: tests define the contract before
// packages/orchestrator/src/loot-faq.ts exists.
// readLootRules: resolveOfficialDomain 2-hop (SSRF-guarded) → fetch facade →
// sanitized text capped 8000; null on hop/fetch failure.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readLootRules } from './loot-faq.js';
import { _resetJinaCoolingForTests } from '@zod/sanitize/fetch';

const LONG_MARKDOWN =
  '# CKA Exam FAQ\n\nThe CKA exam voucher is free for CNCF members. No credit card is required. ' +
  'Shipping is worldwide at no additional cost. Claim steps: 1. Register at the CNCF training portal. ' +
  '2. Redeem the voucher code at checkout. '.repeat(120); // well over 500 chars for Jina, under 8000 cap

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  _resetJinaCoolingForTests();
});

// Mock fetch that routes by URL:
// - link-hop redirect calls (candidate / intermediate / official URLs)
// - Jina facade calls (https://r.jina.ai/<url>)
function installFetchRouter(routes: Record<string, () => Response>): void {
  mockFetch.mockImplementation(async (input: any) => {
    const url = String(input);
    const handler = routes[url];
    if (handler) return handler();
    // Default: official-domain 200 (isOfficialDomain true for https public)
    return new Response(null, { status: 200 });
  });
}

describe('readLootRules', () => {
  it('2-hop success → returns capped FAQ text', async () => {
    installFetchRouter({
      // Hop 1: aggregator → intermediate
      'https://aggregator.example.com/faq': () =>
        new Response(null, { status: 302, headers: { location: 'https://intermediate.example.com/faq' } }),
      // Hop 2: intermediate → official
      'https://intermediate.example.com/faq': () =>
        new Response(null, { status: 302, headers: { location: 'https://official.example.com/faq' } }),
      // Official domain returns 200 (isOfficialDomain: https + non-private)
      'https://official.example.com/faq': () => new Response(null, { status: 200 }),
      // Jina facade call for the final URL
      'https://r.jina.ai/https://official.example.com/faq': () =>
        new Response(LONG_MARKDOWN, { status: 200, headers: { 'content-type': 'text/plain' } }),
    });

    const text = await readLootRules('https://aggregator.example.com/faq');
    expect(text).not.toBeNull();
    expect(text!.length).toBeGreaterThan(0);
    expect(text!.length).toBeLessThanOrEqual(8000);
    expect(text).toContain('CKA Exam FAQ');
  });

  it('hop failure (exceeds 2 hops) → null, hop cap honored', async () => {
    installFetchRouter({
      'https://aggregator.example.com/hopfail': () =>
        new Response(null, { status: 302, headers: { location: 'https://hop1.example.com/faq' } }),
      'https://hop1.example.com/faq': () =>
        new Response(null, { status: 302, headers: { location: 'https://hop2.example.com/faq' } }),
      'https://hop2.example.com/faq': () =>
        new Response(null, { status: 302, headers: { location: 'https://hop3.example.com/faq' } }),
    });

    const text = await readLootRules('https://aggregator.example.com/hopfail');
    expect(text).toBeNull();
  });

  it('private/loopback hop target blocked by SSRF guard → null', async () => {
    installFetchRouter({
      'https://aggregator.example.com/ssrf': () =>
        new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }),
    });

    const text = await readLootRules('https://aggregator.example.com/ssrf');
    expect(text).toBeNull();
  });

  it('final fetch failure → null, no unfetched content audited', async () => {
    installFetchRouter({
      'https://aggregator.example.com/fetchfail': () =>
        new Response(null, { status: 302, headers: { location: 'https://official.example.com/faq' } }),
      'https://official.example.com/faq': () => new Response(null, { status: 200 }),
      'https://r.jina.ai/https://official.example.com/faq': () => {
        throw new Error('network down');
      },
    });

    const text = await readLootRules('https://aggregator.example.com/fetchfail');
    expect(text).toBeNull();
  });

  it('direct non-redirect non-official URL → null', async () => {
    // http:// fails isOfficialDomain (not https)
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const text = await readLootRules('http://example.com/faq');
    expect(text).toBeNull();
  });
});
