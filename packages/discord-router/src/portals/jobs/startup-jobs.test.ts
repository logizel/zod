import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './startup-jobs.js';

// Mock fetch returning startup.jobs XML/RSS
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

describe('startup.jobs adapter (XML/RSS mode)', () => {
  it('parses XML feed items into PollCandidate[]', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Frontend Intern</title>
              <link>https://startup.jobs/company/frontend-intern</link>
              <description>React, TypeScript, remote India</description>
            </item>
            <item>
              <title>Backend Engineer</title>
              <link>https://startup.jobs/company/backend-engineer</link>
              <description>${'Build APIs. '.repeat(30)}</description>
            </item>
            <!-- missing link → skipped -->
            <item>
              <title>No Link Job</title>
              <description>should be skipped</description>
            </item>
          </channel>
        </rss>`,
        { status: 200, headers: { 'content-type': 'application/xml' } },
      ),
    );

    const result = await list();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      url: 'https://startup.jobs/company/frontend-intern',
      title: 'Frontend Intern',
      snippet: 'React, TypeScript, remote India',
    });
    expect(result[0].snippet.length).toBeLessThanOrEqual(200);
    expect(result[1].title).toBe('Backend Engineer');
    expect(result[1].snippet.length).toBeLessThanOrEqual(200);
  });

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));
    const result = await list();
    expect(result).toEqual([]);
  });

  it('returns empty array on empty feed', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`,
        { status: 200, headers: { 'content-type': 'application/xml' } },
      ),
    );
    const result = await list();
    expect(result).toEqual([]);
  });
});
