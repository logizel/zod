import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const browserFetch = vi.hoisted(() => vi.fn(async (url: string) => `<html><body>browser:${url}</body></html>`));
vi.mock('@zod/browser', () => ({
  fetchViaBrowser: browserFetch,
}));

import { fetch, _resetJinaCoolingForTests } from './fetch.js';

describe('fetch facade', () => {
  beforeEach(() => {
    _resetJinaCoolingForTests();
    browserFetch.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns jina source on Jina success', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => 'y'.repeat(600),
    }));
    const res = await fetch('https://example.com/event');
    expect(res.source).toBe('jina');
    expect(browserFetch).not.toHaveBeenCalled();
  });

  it('does not fall to browser on jina success', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => 'y'.repeat(600),
    }));
    await fetch('https://example.com/ok');
    expect(browserFetch).not.toHaveBeenCalled();
  });

  it('falls to browser on Jina HTTP error', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => '',
    }));
    const res = await fetch('https://example.com/err');
    expect(res.source).toBe('browser');
    expect(browserFetch).toHaveBeenCalled();
  });

  it('falls to browser on Jina short body', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => 'short',
    }));
    const res = await fetch('https://example.com/short');
    expect(res.source).toBe('browser');
  });

  it('throttles 402 and parks Jina for 60s', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 402,
      headers: { get: () => null },
      text: async () => '',
    }));
    const res1 = await fetch('https://example.com/t');
    expect(res1.source).toBe('browser');
    // Second call should skip Jina entirely (cooling) -> browser
    vi.stubGlobal('fetch', async () => {
      throw new Error('should not call jina');
    });
    const res2 = await fetch('https://example.com/t2');
    expect(res2.source).toBe('browser');
  });

  it('rejects SSRF private URLs before fetch', async () => {
    for (const u of ['http://127.0.0.1/x', 'http://localhost/x', 'http://169.254.169.254/latest']) {
      await expect(fetch(u)).rejects.toThrow(/private|SSRF/i);
    }
    expect(browserFetch).not.toHaveBeenCalled();
  });
});
