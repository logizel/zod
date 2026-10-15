import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './clist.js';

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch as unknown);
});

describe('clist adapter (api mode)', () => {
  it('emits PollCandidate[] with title+snippet from mocked JSON', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          objects: [
            {
              id: 1,
              title: 'CLIST Hackathon 2026',
              url: 'https://clist.by/event/1/',
              description: '24-hour online hackathon with prizes',
              start: '2026-12-15T09:00:00Z',
              end: '2026-12-16T18:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      url: 'https://clist.by/event/1/',
      title: 'CLIST Hackathon 2026',
      snippet: '24-hour online hackathon with prizes',
    });
    expect(result[0]).not.toHaveProperty('markdown');
    expect(result[0]).not.toHaveProperty('description_raw');
  });

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));
    const result = await list();
    expect(result).toEqual([]);
  });

  it('filters by since date when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          objects: [
            {
              id: 1,
              title: 'Old Event',
              url: 'https://clist.by/event/1/',
              description: 'past event',
              start: '2026-01-01T00:00:00Z',
              end: '2026-01-02T00:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const since = new Date('2026-06-01T00:00:00Z');
    const result = await list({ since });
    // API-level filtering via start__gte param is in the URL
    expect(result).toHaveLength(1);
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('start__gte=');
  });
});
