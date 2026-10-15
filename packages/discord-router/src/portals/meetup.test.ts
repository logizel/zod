import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './meetup.js';

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: vi.fn(),
}));

import { fetchViaBrowser } from '@zod/browser';

beforeEach(() => {
  vi.mocked(fetchViaBrowser).mockReset();
});

describe('meetup adapter (scrape mode)', () => {
  it('emits PollCandidate[] with title+snippet from mocked HTML', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce(`
      <html><body>
        <div class="event-card">
          <h3>Weekly Developer Meetup</h3>
          <p class="description">Weekly hackathon and coding session</p>
          <a href="/events/weekly-dev-meetup">View</a>
        </div>
      </body></html>
    `);

    const result = await list();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'Weekly Developer Meetup',
      snippet: 'Weekly hackathon and coding session',
    });
    expect(result[0].url).toContain('meetup.com');
    expect(result[0]).not.toHaveProperty('markdown');
  });

  it('returns empty array when no cards found', async () => {
    vi.mocked(fetchViaBrowser).mockResolvedValueOnce('<html><body></body></html>');
    const result = await list();
    expect(result).toEqual([]);
  });
});
