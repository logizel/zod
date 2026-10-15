import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './ctftime.js';

// Mock fetch returning CTFtime JSON listing
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

describe('ctftime adapter (api mode)', () => {
  it('emits PollCandidate[] with title+snippet from mock JSON listing', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1,
            title: 'National CTF 2026',
            url: 'https://ctftime.org/event/123/',
            description: '24-hour CTF with ₹1L cash prize',
            start: '2026-12-15T09:00:00+05:30',
            finish: '2026-12-16T18:00:00+05:30',
          },
          {
            id: 2,
            title: 'Regional Hackathon',
            url: 'https://ctftime.org/event/124/',
            description: 'Weekend cybersecurity challenge',
            start: '2026-12-20T10:00:00+05:30',
            finish: '2026-12-21T18:00:00+05:30',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await list();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      url: 'https://ctftime.org/event/123/',
      title: 'National CTF 2026',
      snippet: '24-hour CTF with ₹1L cash prize',
    });
    expect(result[1]).toMatchObject({
      url: 'https://ctftime.org/event/124/',
      title: 'Regional Hackathon',
      snippet: 'Weekend cybersecurity challenge',
    });
    // No markdown or full-fetch fields
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
        JSON.stringify([
          {
            id: 1,
            title: 'Old Event',
            url: 'https://ctftime.org/event/1/',
            description: 'past event',
            start: '2026-01-01T00:00:00+05:30',
            finish: '2026-01-02T00:00:00+05:30',
          },
          {
            id: 2,
            title: 'New Event',
            url: 'https://ctftime.org/event/2/',
            description: 'future event',
            start: '2026-12-15T00:00:00+05:30',
            finish: '2026-12-16T00:00:00+05:30',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const since = new Date('2026-06-01T00:00:00+05:30');
    const result = await list({ since });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('New Event');
  });
});
