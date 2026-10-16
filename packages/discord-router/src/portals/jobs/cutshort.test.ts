import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchViaBrowserMock = vi.hoisted(() => vi.fn());

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: fetchViaBrowserMock,
}));

import { list } from './cutshort.js';
import { fetchViaBrowser } from '@zod/browser';

beforeEach(() => {
  vi.mocked(fetchViaBrowser).mockReset();
});

describe('cutshort adapter (browser mode)', () => {
  it('maps Cutshort job cards to PollCandidate[] with absolutized URLs', async () => {
    vi.mocked(fetchViaBrowser)
      .mockResolvedValueOnce(`
        <html><body>
          <div class="job-card">
            <h3 class="job-title">Frontend Intern</h3>
            <p class="description">React, TypeScript, remote India</p>
            <a href="/jobs/frontend-intern">Apply</a>
          </div>
          <div class="job-card">
            <h3 class="job-title">Backend Engineer</h3>
            <p class="description">${'Build APIs. '.repeat(30)}</p>
            <a href="/jobs/backend-engineer">Apply</a>
          </div>
        </body></html>
      `)
      // Page 2: no cards → stop pagination
      .mockResolvedValueOnce('<html><body></body></html>');

    const result = await list();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      title: 'Frontend Intern',
      snippet: 'React, TypeScript, remote India',
    });
    expect(result[0].url).toBe('https://cutshort.io/jobs/frontend-intern');
    expect(result[0].snippet.length).toBeLessThanOrEqual(200);
    expect(result[1].title).toBe('Backend Engineer');
    expect(result[1].snippet.length).toBeLessThanOrEqual(200);
    // Bounded pagination: page 1 + page 2 (empty, stops)
    expect(vi.mocked(fetchViaBrowser)).toHaveBeenCalledTimes(2);
  });

  it('paginates contiguously across 2 pages (no gap or repeat at seam)', async () => {
    vi.mocked(fetchViaBrowser)
      .mockResolvedValueOnce(`
        <html><body>
          <div class="job-card">
            <h3 class="job-title">Page 1 Job</h3>
            <a href="/jobs/p1">Apply</a>
          </div>
        </body></html>
      `)
      .mockResolvedValueOnce(`
        <html><body>
          <div class="job-card">
            <h3 class="job-title">Page 2 Job</h3>
            <a href="/jobs/p2">Apply</a>
          </div>
        </body></html>
      `);

    const result = await list();

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Page 1 Job');
    expect(result[1].title).toBe('Page 2 Job');
    expect(result[1].url).toBe('https://cutshort.io/jobs/p2');
    // Exactly 2 page fetches (bounded at 2)
    expect(vi.mocked(fetchViaBrowser)).toHaveBeenCalledTimes(2);
    // Page seam contiguous: different URLs, no repeat
    expect(result[0].url).not.toBe(result[1].url);
  });

  it('stops pagination when a page has no cards', async () => {
    vi.mocked(fetchViaBrowser)
      .mockResolvedValueOnce(`
        <html><body>
          <div class="job-card">
            <h3 class="job-title">Only Job</h3>
            <a href="/jobs/only">Apply</a>
          </div>
        </body></html>
      `)
      .mockResolvedValueOnce('<html><body></body></html>');

    const result = await list();

    expect(result).toHaveLength(1);
    // Page 2 not fetched because page 1 had cards but page 2 had none
    expect(vi.mocked(fetchViaBrowser)).toHaveBeenCalledTimes(2);
  });

  it('skips malformed cards missing title or href', async () => {
    vi.mocked(fetchViaBrowser)
      .mockResolvedValueOnce(`
        <html><body>
          <div class="job-card">
            <h3 class="job-title">Valid Job</h3>
            <a href="/jobs/valid">Apply</a>
          </div>
          <div class="job-card">
            <!-- missing title -->
            <a href="/jobs/no-title">Apply</a>
          </div>
          <div class="job-card">
            <!-- missing href -->
            <h3 class="job-title">No Link Job</h3>
          </div>
        </body></html>
      `)
      // Page 2: no cards → stop pagination
      .mockResolvedValueOnce('<html><body></body></html>');

    const result = await list();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Valid Job');
  });

  it('returns empty array on browser error', async () => {
    vi.mocked(fetchViaBrowser).mockRejectedValueOnce(new Error('browser crashed'));
    const result = await list();
    expect(result).toEqual([]);
  });
});
