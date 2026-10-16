import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './ashby.js';

// Mock fetch returning Ashby job-board JSON
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

describe('ashby adapter (api mode)', () => {
  it('maps Ashby jobs[] to PollCandidate[] with jobUrl + stripped descriptionHtml snippet', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          apiVersion: '1.0',
          jobs: [
            {
              id: 'j1',
              title: 'Backend Engineer',
              jobUrl: 'https://jobs.ashbyhq.com/acme/j1',
              descriptionHtml: '<p>Design APIs. </p>'.repeat(30), // >200 chars
              location: 'Bengaluru, India',
            },
            {
              id: 'j2',
              title: 'Product Design Intern',
              jobUrl: 'https://jobs.ashbyhq.com/acme/j2',
              descriptionHtml: '<p>Figma, prototypes, user research</p>',
            },
            // missing jobUrl → skipped
            {
              id: 'j3',
              title: 'No URL Job',
              descriptionHtml: '<p>should be skipped</p>',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await list({ board: 'acme' });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      url: 'https://jobs.ashbyhq.com/acme/j1',
      title: 'Backend Engineer',
    });
    expect(result[0].snippet.length).toBeLessThanOrEqual(200);
    expect(result[1]).toMatchObject({
      url: 'https://jobs.ashbyhq.com/acme/j2',
      title: 'Product Design Intern',
      snippet: 'Figma, prototypes, user research',
    });
  });

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));
    const result = await list({ board: 'acme' });
    expect(result).toEqual([]);
  });

  it('returns empty array on empty jobs payload', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ jobs: [] }), { status: 200 }),
    );
    const result = await list({ board: 'acme' });
    expect(result).toEqual([]);
  });
});
