import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './unstop.js';

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: vi.fn(),
}));

import { fetchViaBrowser } from '@zod/browser';

beforeEach(() => {
  vi.mocked(fetchViaBrowser).mockReset();
});

describe('unstop adapter (scrape mode)', () => {
  it('emits PollCandidate[] with title+snippet from mocked HTML', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce(`
      <html><body>
        <div class="competition-card">
          <h3>Unstop Hackathon 2026</h3>
          <p class="description">Cash prize Rs 1,00,000 for winners</p>
          <a href="/competitions/unstop-hackathon-2026">View</a>
        </div>
      </body></html>
    `);

    const result = await list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'Unstop Hackathon 2026',
      snippet: 'Cash prize Rs 1,00,000 for winners',
    });
    expect(result[0].url).toContain('unstop.com');
    expect(result[0]).not.toHaveProperty('markdown');
    expect(result[0]).not.toHaveProperty('description_raw');
  });

  it('returns empty array when no cards found', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce('<html><body></body></html>');
    const result = await list();
    expect(result).toEqual([]);
  });
});
