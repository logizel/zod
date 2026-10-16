import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './cuvette.js';

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: vi.fn(),
}));

import { fetchViaBrowser } from '@zod/browser';

beforeEach(() => {
  vi.mocked(fetchViaBrowser).mockReset();
});

describe('cuvette adapter (browser mode with fallback, assumption A2)', () => {
  it('maps Cuvette listing cards to PollCandidate[] via fetchViaBrowser', async () => {
    vi.mocked(fetchViaBrowser)
      .mockResolvedValueOnce(`
        <html><body>
          <div class="listing-card">
            <h2 class="title">Product Design Intern</h2>
            <p class="description">Figma, prototypes, user research</p>
            <a href="/jobs/product-design-intern">Apply</a>
          </div>
          <div class="listing-card">
            <h2 class="title">UX Researcher</h2>
            <p class="description">${'User interviews and research. '.repeat(30)}</p>
            <a href="/jobs/ux-researcher">Apply</a>
          </div>
        </body></html>
      `)
      // Page 2: no cards → stop pagination
      .mockResolvedValueOnce('<html><body></body></html>');

    const result = await list();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      title: 'Product Design Intern',
    });
    expect(result[0].url).toContain('cuvette');
    expect(result[0].snippet.length).toBeLessThanOrEqual(200);
    expect(result[1].title).toBe('UX Researcher');
    expect(result[1].snippet.length).toBeLessThanOrEqual(200);
    // fetchViaBrowser called (browser mode)
    expect(vi.mocked(fetchViaBrowser)).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when no listings found', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce('<html><body></body></html>');
    const result = await list();
    expect(result).toEqual([]);
  });

  it('returns empty array on browser error', async () => {
    vi.mocked(fetchViaBrowser).mockRejectedValueOnce(new Error('browser failed'));
    const result = await list();
    expect(result).toEqual([]);
  });

  it('is bounded to 2 pages max', async () => {
    vi.mocked(fetchViaBrowser)
      .mockResolvedValueOnce(`
        <html><body>
          <div class="listing-card">
            <h2 class="title">Job 1</h2>
            <a href="/jobs/1">Apply</a>
          </div>
        </body></html>
      `)
      .mockResolvedValueOnce(`
        <html><body>
          <div class="listing-card">
            <h2 class="title">Job 2</h2>
            <a href="/jobs/2">Apply</a>
          </div>
        </body></html>
      `)
      // Page 3 would be fetched but loop stops at 2
      .mockResolvedValueOnce('<html><body></body></html>');

    const result = await list();
    expect(result).toHaveLength(2);
    expect(vi.mocked(fetchViaBrowser)).toHaveBeenCalledTimes(2);
  });
});
