import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './devfolio.js';

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: vi.fn(),
}));

import { fetchViaBrowser } from '@zod/browser';

beforeEach(() => {
  vi.mocked(fetchViaBrowser).mockReset();
});

describe('devfolio adapter (scrape mode)', () => {
  it('emits PollCandidate[] with title+snippet from mocked HTML', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce(`
      <html><body>
        <div class="hackathon-card">
          <h3>Devfolio Hackathon</h3>
          <p class="description">Register now prizes worth Rs 50,000</p>
          <a href="/hackathons/devfolio-hackathon">View</a>
        </div>
      </body></html>
    `);

    const result = await list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'Devfolio Hackathon',
      snippet: 'Register now prizes worth Rs 50,000',
    });
    expect(result[0].url).toContain('devfolio.co');
    expect(result[0]).not.toHaveProperty('markdown');
  });

  it('returns empty array when no cards found', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce('<html><body></body></html>');
    const result = await list();
    expect(result).toEqual([]);
  });
});
