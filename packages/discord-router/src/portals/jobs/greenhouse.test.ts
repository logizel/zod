import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list, fetchDetailText } from './greenhouse.js';

// Mock fetch returning Greenhouse board JSON listing
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

describe('greenhouse adapter (api mode)', () => {
  it('listing fixture → PollCandidate[] with url, title, snippet ≤200 chars', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          meta: { total: 2 },
          jobs: [
            {
              id: 1,
              title: 'Frontend Engineer (Fresher)',
              updated_at: '2026-10-15T08:00:00Z',
              location: { name: 'Bangalore, India' },
              absolute_url: 'https://boards.greenhouse.io/acme/jobs/1',
              content:
                '<p>We are hiring a frontend engineer. React, TypeScript, 0-1 years experience.</p>',
            },
            {
              id: 2,
              title: 'Backend Engineer',
              updated_at: '2026-10-15T09:00:00Z',
              location: { name: 'Remote, India' },
              absolute_url: 'https://boards.greenhouse.io/acme/jobs/2',
              content:
                '<p>Node.js, PostgreSQL, AWS. 2+ years experience required. Based in Hyderabad.</p>'.repeat(50), // long content → snippet capped
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await list();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      url: 'https://boards.greenhouse.io/acme/jobs/1',
      title: 'Frontend Engineer (Fresher)',
      snippet: 'We are hiring a frontend engineer. React, TypeScript, 0-1 years experience.',
    });
    expect(result[0].snippet.length).toBeLessThanOrEqual(200);
    // Raw content field never carried into the candidate (T-05-02 + Pitfall 6)
    expect(result[0]).not.toHaveProperty('content');
    // Second job snippet capped at 200 chars
    expect(result[1].snippet.length).toBeLessThanOrEqual(200);
    expect(result[1].title).toBe('Backend Engineer');
  });

  it('non-ok response returns empty array, never throws', async () => {
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));
    const result = await list();
    expect(result).toEqual([]);
  });

  it('fetchDetailText resolves single-job detail URL and returns text ≤8000', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        '<h1>Job Detail</h1><p>Full job description here with all requirements.</p>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );

    const cand = { url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Job 1', snippet: '' };
    const text = await fetchDetailText(cand);
    expect(text).toContain('Full job description here');
    expect(text!.length).toBeLessThanOrEqual(8000);
  });

  it('fetchDetailText returns null on unparseable URL (SSRF guard)', async () => {
    const cand = { url: 'http://127.0.0.1/admin', title: 'Bad', snippet: '' };
    const text = await fetchDetailText(cand);
    expect(text).toBeNull();
  });

  it('fetchDetailText returns null on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('not found', { status: 404 }));
    const cand = { url: 'https://boards.greenhouse.io/acme/jobs/999', title: 'Missing', snippet: '' };
    const text = await fetchDetailText(cand);
    expect(text).toBeNull();
  });

  it('fetchDetailText returns null on fetch exception', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const cand = { url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Job 1', snippet: '' };
    const text = await fetchDetailText(cand);
    expect(text).toBeNull();
  });
});
