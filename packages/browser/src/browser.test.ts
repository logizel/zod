import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('playwright-core', () => {
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
  };
  return {
    chromium: {
      launch: vi.fn(async () => browser),
    },
  };
});

import { fetchViaBrowser, shutdown } from './queue.js';

describe('browser queue', () => {
  it('returns html and closes context', async () => {
    const html = await fetchViaBrowser('https://example.com');
    expect(html).toContain('ok');
  });
});
