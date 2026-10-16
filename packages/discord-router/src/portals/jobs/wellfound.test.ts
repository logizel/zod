import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchViaBrowserMock = vi.hoisted(() => vi.fn());
const mockFetch = vi.fn();

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: fetchViaBrowserMock,
}));

vi.stubGlobal('fetch', mockFetch);

import { list, WELLFOUND_PRIMARY_MODE } from './wellfound.js';
import { fetchViaBrowser } from '@zod/browser';

beforeEach(() => {
  mockFetch.mockReset();
  vi.mocked(fetchViaBrowser).mockReset();
});

function mockFetchOk(html: string) {
  mockFetch.mockResolvedValueOnce(new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  }));
}

describe('wellfound adapter (fetch-facade primary — PROBE_VERDICT: fetch-facade primary)', () => {
  it('primary mode constant is fetch-facade', () => {
    expect(WELLFOUND_PRIMARY_MODE).toBe('fetch-facade');
  });

  it('parse listing markup on the fetch-facade path', async () => {
    mockFetchOk(`
      <html><body>
        <div class="job-card">
          <h3 class="job-title">Frontend Intern</h3>
          <p class="description">React, TypeScript, remote India</p>
          <a href="/company/rampwork/jobs/frontend-intern">Apply</a>
        </div>
        <div class="job-card">
          <h3 class="job-title">Backend Engineer</h3>
          <p class="description">${'Build scalable APIs. '.repeat(20)}</p>
          <a href="/company/alwayzon/jobs/backend">Apply</a>
        </div>
      </body></html>
    `);

    const result = await list();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      title: 'Frontend Intern',
      url: 'https://wellfound.com/company/rampwork/jobs/frontend-intern',
    });
    expect(result[0].snippet.length).toBeLessThanOrEqual(200);
    expect(result[1].title).toBe('Backend Engineer');
    // fetch-facade used, no browser fallback needed
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchViaBrowser)).not.toHaveBeenCalled();
  });

  it('shell response → exactly one fetchViaBrowser retry, then candidates', async () => {
    // Shell: zero anchors
    mockFetchOk('<html><body><div id="__next"></div></body></html>');
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce(`
      <html><body>
        <div class="job-card">
          <h3 class="job-title">Browser-Rendered Job</h3>
          <a href="/company/simplismart/jobs/intern">Apply</a>
        </div>
      </body></html>
    `);

    const result = await list();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Browser-Rendered Job');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchViaBrowser)).toHaveBeenCalledTimes(1);
  });

  it('non-ok response returns empty array, never throws', async () => {
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));

    const result = await list();

    expect(result).toEqual([]);
  });

  it('shell + browser error → [] (both fail, never throws)', async () => {
    mockFetchOk('<html><body><div id="__next"></div></body></html>');
    vi.mocked(fetchViaBrowser).mockRejectedValueOnce(new Error('browser down'));

    const result = await list();

    expect(result).toEqual([]);
  });

  it('skips malformed cards missing title or href', async () => {
    mockFetchOk(`
      <html><body>
        <div class="job-card">
          <h3 class="job-title">Valid Job</h3>
          <a href="/jobs/valid">Apply</a>
        </div>
        <div class="job-card">
          <a href="/jobs/no-title">Apply</a>
        </div>
      </body></html>
    `);

    const result = await list();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Valid Job');
  });
});
