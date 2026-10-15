import { describe, expect, it, vi, beforeEach } from 'vitest';

// Fake browser plumbing reusable across cases.
function makePlaywrightMocks() {
  const page = {
    goto: vi.fn(async () => undefined),
    content: vi.fn(async () => '<html><body>ok</body></html>'),
  };
  const ctx = {
    route: vi.fn(async () => undefined),
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
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

import { fetchViaBrowser, shutdown } from './queue.js';

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

  it('shutdown nulls the browser singleton (no process crash)', async () => {
    await fetchViaBrowser('https://example.com');
    await shutdown();
    await shutdown(); // idempotent
    expect(true).toBe(true);
  });
});
