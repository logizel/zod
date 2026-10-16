import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './workday.js';

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: vi.fn(),
}));

import { fetchViaBrowser } from '@zod/browser';

// Mock global fetch for cxs JSON POST
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.mocked(fetchViaBrowser).mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

describe('workday adapter (cxs JSON first + browser fallback, assumption A1)', () => {
  it('maps cxs jobPostings[] to candidates with absolute URLs', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jobPostings: [
            {
              externalPath: '/jobs/backend-engineer',
              title: 'Backend Engineer',
              locationsText: 'Bengaluru, India',
              postedOn: '2026-10-01',
            },
            {
              externalPath: '/jobs/frontend-intern',
              title: 'Frontend Intern',
              locationsText: 'Remote - India',
              postedOn: '2026-10-02',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await list();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      title: 'Backend Engineer',
      snippet: 'Bengaluru, India | 2026-10-01',
    });
    expect(result[0].url).toContain('.myworkdayjobs.com/');
    expect(result[0].url).toContain('/jobs/backend-engineer');
    expect(result[0].snippet.length).toBeLessThanOrEqual(200);
    // cxs path used, no browser fallback
    expect(vi.mocked(fetchViaBrowser)).not.toHaveBeenCalled();
  });

  it('degrades to fetchViaBrowser exactly once when cxs fails (D-03)', async () => {
    // cxs POST fails (non-ok)
    mockFetch.mockResolvedValueOnce(new Response('cxs error', { status: 502 }));
    // Browser fallback succeeds
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce(`
      <html><body>
        <div class="job-listing">
          <h3 class="job-title">Browser Fallback Job</h3>
          <a href="/jobs/browser-job">Apply</a>
        </div>
      </body></html>
    `);

    const result = await list();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Browser Fallback Job');
    // cxs attempted once, browser fallback invoked exactly once
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchViaBrowser)).toHaveBeenCalledTimes(1);
    // Tick does not throw
  });

  it('returns empty array when both cxs and browser fail', async () => {
    mockFetch.mockResolvedValueOnce(new Response('cxs error', { status: 502 }));
    vi.mocked(fetchViaBrowser).mockRejectedValueOnce(new Error('browser failed'));

    const result = await list();
    expect(result).toEqual([]);
    // No throw — tick continues
  });

  it('returns empty array on empty cxs jobPostings', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ jobPostings: [] }), { status: 200 }),
    );
    const result = await list();
    expect(result).toEqual([]);
  });
});
