import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './luma.js';

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: vi.fn(),
}));

import { fetchViaBrowser } from '@zod/browser';

beforeEach(() => {
  vi.mocked(fetchViaBrowser).mockReset();
});

describe('luma adapter (scrape mode)', () => {
  it('emits PollCandidate[] with title+snippet from mocked HTML', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce(`
      <html><body>
        <div class="event-card">
          <h3>Luma Community Event</h3>
          <p class="description">Free workshop online for developers</p>
          <a href="/events/luma-community-event">View</a>
        </div>
      </body></html>
    `);

    const result = await list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'Luma Community Event',
      snippet: 'Free workshop online for developers',
    });
    expect(result[0].url).toContain('lu.ma');
    expect(result[0]).not.toHaveProperty('markdown');
  });

  it('returns empty array when no cards found', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce('<html><body></body></html>');
    const result = await list();
    expect(result).toEqual([]);
  });
});
