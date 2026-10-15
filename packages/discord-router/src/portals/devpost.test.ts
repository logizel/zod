import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './devpost.js';

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: vi.fn(),
}));

import { fetchViaBrowser } from '@zod/browser';

beforeEach(() => {
  vi.mocked(fetchViaBrowser).mockReset();
});

describe('devpost adapter (scrape mode)', () => {
  it('emits PollCandidate[] with title+snippet from mocked HTML', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce(`
      <html><body>
        <div class="hackathon">
          <h3>Devpost Challenge 2026</h3>
          <p class="description">Build innovative solutions for cash prizes</p>
          <a href="/challenges/devpost-challenge">View</a>
        </div>
      </body></html>
    `);

    const result = await list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'Devpost Challenge 2026',
      snippet: 'Build innovative solutions for cash prizes',
    });
    expect(result[0].url).toContain('devpost.com');
    expect(result[0]).not.toHaveProperty('markdown');
  });

  it('returns empty array when no cards found', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce('<html><body></body></html>');
    const result = await list();
    expect(result).toEqual([]);
  });
});
