import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchViaBrowserMock = vi.hoisted(() => vi.fn());

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: fetchViaBrowserMock,
}));

import { list, YC_PRIMARY_MODE } from './yc.js';
import { fetchViaBrowser } from '@zod/browser';

beforeEach(() => {
  vi.mocked(fetchViaBrowser).mockReset();
});

describe('yc adapter (browser mode — PROBE_VERDICT: browser primary)', () => {
  it('primary mode constant is browser', () => {
    expect(YC_PRIMARY_MODE).toBe('browser');
  });

  it('maps rendered job cards to PollCandidate[] with absolutized URLs', async () => {
    vi.mocked(fetchViaBrowser)
      .mockResolvedValueOnce(`
        <html><body>
          <div class="job-card">
            <h3 class="job-title">Frontend Intern</h3>
            <p class="description">React, TypeScript, remote India, 0-1 years</p>
            <a href="/company/acme/jobs/frontend-intern">Apply</a>
          </div>
          <div class="job-card">
            <h3 class="job-title">Backend Engineer</h3>
            <p class="description">${'Build APIs. '.repeat(30)}</p>
            <a href="/company/acme/jobs/backend">Apply</a>
          </div>
        </body></html>
      `)
      // Page 2: no cards → contiguous seam, stop
      .mockResolvedValueOnce('<html><body></body></html>');

    const result = await list();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      title: 'Frontend Intern',
      url: 'https://www.workatastartup.com/company/acme/jobs/frontend-intern',
    });
    expect(result[0].snippet.length).toBeLessThanOrEqual(200);
    expect(result[1].title).toBe('Backend Engineer');
    // Bounded pagination: page 1 + page 2 (empty, stops)
    expect(vi.mocked(fetchViaBrowser)).toHaveBeenCalledTimes(2);
  });

  it('paginates contiguously across 2 pages with no gap or repeat at seam', async () => {
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
      `)
      // Page 3 would be fetched but loop stops at page 2
      ;

    const result = await list();

    expect(result).toHaveLength(2);
    expect(result[0].url).not.toBe(result[1].url);
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
            <a href="/jobs/no-title">Apply</a>
          </div>
          <div class="job-card">
            <h3 class="job-title">No Link Job</h3>
          </div>
        </body></html>
      `)
      .mockResolvedValueOnce('<html><body></body></html>');

    const result = await list();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Valid Job');
  });

  it('returns empty array on browser error (never throws)', async () => {
    vi.mocked(fetchViaBrowser).mockRejectedValueOnce(new Error('browser crashed'));

    const result = await list();

    expect(result).toEqual([]);
  });

  it('returns empty array when page 1 has no cards (no page 2 fetch)', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce('<html><body></body></html>');

    const result = await list();

    expect(result).toEqual([]);
    expect(vi.mocked(fetchViaBrowser)).toHaveBeenCalledTimes(1);
  });
});
