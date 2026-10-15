import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveOfficialDomain } from './link-hop.js';

// Mock fetch with redirect responses
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

describe('resolveOfficialDomain', () => {
  it('resolves a 2-hop chain to official domain with ok=true, hops=2', async () => {
    // Hop 1: aggregator -> intermediate
    // Hop 2: intermediate -> official domain
    // Final: official domain returns 200
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://intermediate.example.com/step2' } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://official.example.com/event' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const result = await resolveOfficialDomain('https://aggregator.example.com/event');
    expect(result.ok).toBe(true);
    expect(result.hops).toBe(2);
    expect(result.finalUrl).toBe('https://official.example.com/event');
  });

  it('returns ok=false when hops exceed 2 without official domain (link_hop_failed)', async () => {
    // 3 redirects, none is official (all non-https or non-public)
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://hop1.example.com' } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://hop2.example.com' } }));

    const result = await resolveOfficialDomain('https://aggregator.example.com/event');
    expect(result.ok).toBe(false);
    expect(result.hops).toBe(2);
  });

  it('rejects private/loopback Location header immediately via SSRF guard', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }),
    );

    const result = await resolveOfficialDomain('https://aggregator.example.com/event');
    expect(result.ok).toBe(false);
    expect(result.hops).toBe(1); // SSRF guard rejects before following
  });

  it('returns ok=false for direct non-redirect non-official URL', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    // fetch is mocked to return 200, but isOfficialDomain checks https + non-private
    // The mocked URL is the input url itself; we need a non-official domain
    // Use http:// to fail isOfficialDomain
    const result = await resolveOfficialDomain('http://example.com/event');
    expect(result.ok).toBe(false);
    expect(result.hops).toBe(0);
  });
});
