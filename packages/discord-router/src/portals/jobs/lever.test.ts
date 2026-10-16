import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './lever.js';

// Mock fetch returning Lever postings JSON
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

describe('lever adapter (api mode)', () => {
  it('maps Lever posts to PollCandidate[] with hostedUrl + descriptionPlain snippet', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: '1',
            text: 'Senior Software Engineer',
            hostedUrl: 'https://jobs.lever.co/acme/1',
            descriptionPlain: 'Build scalable systems. '.repeat(30), // >200 chars
            categories: { location: 'India', commitment: 'Full-time' },
          },
          {
            id: '2',
            text: 'Frontend Intern',
            hostedUrl: 'https://jobs.lever.co/acme/2',
            descriptionPlain: 'React, TypeScript, UI components',
          },
          // missing hostedUrl → skipped
          {
            id: '3',
            text: 'No URL Job',
            hostedUrl: null,
            descriptionPlain: 'should be skipped',
          },
          // missing text → skipped
          {
            id: '4',
            hostedUrl: 'https://jobs.lever.co/acme/4',
            descriptionPlain: 'no title',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await list({ site: 'acme' });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      url: 'https://jobs.lever.co/acme/1',
      title: 'Senior Software Engineer',
    });
    // snippet capped at 200 chars
    expect(result[0].snippet.length).toBeLessThanOrEqual(200);
    expect(result[1]).toMatchObject({
      url: 'https://jobs.lever.co/acme/2',
      title: 'Frontend Intern',
      snippet: 'React, TypeScript, UI components',
    });
  });

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));
    const result = await list({ site: 'acme' });
    expect(result).toEqual([]);
  });

  it('returns empty array on empty payload', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const result = await list({ site: 'acme' });
    expect(result).toEqual([]);
  });

  it('falls back to EU host (api.eu.lever.co) when primary host fails', async () => {
    // First call (api.lever.co) fails, second call (api.eu.lever.co) succeeds
    mockFetch
      .mockResolvedValueOnce(new Response('fail', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: '1',
              text: 'EU Role',
              hostedUrl: 'https://jobs.lever.co/euco/1',
              descriptionPlain: 'EU based role',
            },
          ]),
          { status: 200 },
        ),
      );

    const result = await list({ site: 'euco' });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('EU Role');
    // Both hosts were hit
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstUrl = mockFetch.mock.calls[0][0] as string;
    const secondUrl = mockFetch.mock.calls[1][0] as string;
    expect(firstUrl).toContain('api.lever.co');
    expect(secondUrl).toContain('api.eu.lever.co');
  });
});
