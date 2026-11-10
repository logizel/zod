// Fetch/sanitize machine-event signals (the Glass feed's fetch/sanitize rows).
import { describe, expect, it, vi, beforeEach } from 'vitest';

const browserFetch = vi.hoisted(() => vi.fn(async (url: string) => `<html><body>browser:${url}</body></html>`));
vi.mock('@zod/browser', () => ({
  fetchViaBrowser: browserFetch,
}));

import { fetch, _resetJinaCoolingForTests, type SanitizeEvent } from './fetch.js';

function collect(): { events: SanitizeEvent[]; onEvent: (e: SanitizeEvent) => void } {
  const events: SanitizeEvent[] = [];
  return { events, onEvent: (e) => events.push(e) };
}

describe('fetch facade machine events', () => {
  beforeEach(() => {
    _resetJinaCoolingForTests();
    browserFetch.mockClear();
  });

  it('emits fetch + sanitize events on the Jina path', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => 'y'.repeat(600),
    }));
    const { events, onEvent } = collect();
    const res = await fetch('https://example.com/event', { onEvent });

    expect(res.source).toBe('jina');
    const tools = events.map((e) => `${e.phase}:${e.tool}:${e.status}`);
    expect(tools).toContain('fetch:fetch.jina:start');
    expect(tools).toContain('fetch:fetch.jina:ok');
    expect(tools).toContain('sanitize:sanitize.jina:start');
    expect(tools).toContain('sanitize:sanitize.jina:ok');

    const sanitizeOk = events.find((e) => e.tool === 'sanitize.jina' && e.status === 'ok');
    expect(sanitizeOk?.duration_ms).toBeGreaterThanOrEqual(0);
    expect(sanitizeOk?.chars).toBeGreaterThan(0);
    expect(sanitizeOk?.capped).toBeTypeOf('boolean');
  });

  it('emits a Jina error and the browser fallback events', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => '',
    }));
    const { events, onEvent } = collect();
    const res = await fetch('https://example.com/err', { onEvent });

    expect(res.source).toBe('browser');
    const tools = events.map((e) => `${e.phase}:${e.tool}:${e.status}`);
    expect(tools).toContain('fetch:fetch.jina:error');
    expect(tools).toContain('fetch:fetch.browser:ok');
    expect(tools).toContain('sanitize:sanitize.browser:ok');
  });

  it('never lets an observer failure break the fetch', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => 'y'.repeat(600),
    }));
    const res = await fetch('https://example.com/boom', {
      onEvent: () => {
        throw new Error('observer exploded');
      },
    });
    expect(res.source).toBe('jina');
    expect(res.markdown.length).toBeGreaterThan(0);
  });
});
