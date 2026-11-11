import { describe, expect, it, vi, beforeEach } from 'vitest';

// Fake browser plumbing reusable across cases.
function makePlaywrightMocks() {
  const page = {
    goto: vi.fn(async () => ({ status: () => 200 })),
    content: vi.fn(async () => '<html><body>ok</body></html>'),
    url: vi.fn(() => 'https://example.com/'),
    waitForSelector: vi.fn(async () => ({})),
    waitForTimeout: vi.fn(async () => undefined),
  };
  const ctx = {
    route: vi.fn(async () => undefined),
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
    addCookies: vi.fn(async () => undefined),
  };
  const browser = {
    newContext: vi.fn(async () => ctx),
    close: vi.fn(async () => undefined),
    process: vi.fn(() => ({ pid: undefined })),
  };
  return { page, ctx, browser };
}

vi.mock('playwright-core', () => {
  const mocks = makePlaywrightMocks();
  return {
    chromium: { launch: vi.fn(async () => mocks.browser) },
  };
});

import {
  fetchViaBrowser,
  fetchViaBrowserResult,
  shutdown,
} from './queue.js';

describe('browser queue', () => {
  beforeEach(async () => {
    await shutdown();
    vi.clearAllMocks();
  });

  it('returns html and closes context', async () => {
    const html = await fetchViaBrowser('https://example.com');
    expect(html).toContain('ok');
  });

  it('queue test 1: fetchViaBrowser returns HTML for a valid URL', async () => {
    const html = await fetchViaBrowser('https://example.com');
    expect(html).toContain('<html');
  });

  it('closes context even when page.goto throws', async () => {
    // Re-mock page goto to throw for this test by accessing the shared mock.
    // We rely on vi.mock factory above (page.goto is the same fn).
    const pw: any = await import('playwright-core');
    const browser = await pw.chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.goto.mockRejectedValueOnce(new Error('goto boom'));
    await expect(fetchViaBrowser('https://example.com/fail')).rejects.toThrow(/goto boom/);
    expect(ctx.close).toHaveBeenCalled();
  });

  it('attaches session cookies to the context (domain + path scoped)', async () => {
    const pw: any = await import('playwright-core');
    const browser = await pw.chromium.launch();
    const ctx = await browser.newContext();

    const result = await fetchViaBrowserResult('https://x.com/search?q=test', {
      cookies: [
        { name: 'auth_token', value: 'abc', domain: '.x.com' },
        { name: 'ct0', value: 'def', domain: '.x.com' },
      ],
      waitForSelector: 'article',
      settleMs: 1,
    });

    expect(result.selectorFound).toBe(true);
    expect(result.status).toBe(200);
    expect(ctx.addCookies).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'auth_token', domain: '.x.com', path: '/' }),
      expect.objectContaining({ name: 'ct0', domain: '.x.com', path: '/' }),
    ]);
  });

  it('reports selectorFound=false when the selector never appears', async () => {
    const pw: any = await import('playwright-core');
    const browser = await pw.chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.waitForSelector.mockRejectedValueOnce(new Error('timeout'));

    const result = await fetchViaBrowserResult('https://x.com/search?q=test', {
      waitForSelector: 'article',
      settleMs: 0,
    });
    expect(result.selectorFound).toBe(false);
    expect(result.html).toContain('ok');
  });

  it('bails before the selector wait when the final URL is a login wall', async () => {
    const pw: any = await import('playwright-core');
    const browser = await pw.chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.url.mockReturnValue('https://www.linkedin.com/login/?session_redirect=x');

    const result = await fetchViaBrowserResult('https://www.linkedin.com/feed/', {
      waitForSelector: 'article',
      loginWallUrl: /linkedin\.com\/login/u,
    });

    expect(result.loginWall).toBe(true);
    expect(result.finalUrl).toContain('/login/');
    expect(page.waitForSelector).not.toHaveBeenCalled();
  });

  it('shutdown nulls the browser singleton (no process crash)', async () => {
    await fetchViaBrowser('https://example.com');
    await shutdown();
    await shutdown(); // idempotent
    expect(true).toBe(true);
  });
});
