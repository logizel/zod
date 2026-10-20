import { describe, it, expect, vi, beforeEach } from 'vitest';
import { list } from './hn-whoshiring.js';
import { rmSync } from 'node:fs';
import { DEFAULT_STATE_PATH } from './boards.js';

// Mock fetch for the two-call Algolia recipe
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  // Isolate watermark state between tests (persisted to DEFAULT_STATE_PATH)
  try { rmSync(DEFAULT_STATE_PATH, { force: true }); } catch {}
});

describe('hn-whoshiring adapter (Algolia two-call recipe)', () => {
  it('resolves latest thread then maps top-level comments to candidates', async () => {
    // Call 1: search_by_date → thread discovery
    // Call 2: items/:threadId → full comment tree
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            hits: [{ objectID: 'thread-42', title: 'Who is hiring? (October 2026)' }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            objectID: 'thread-42',
            children: [
              {
                objectID: 'c1',
                created_at_i: 1790000000,
                comment_text: 'We are hiring!\nApply at https://boards.greenhouse.io/acme/jobs/1\nReact, Node',
              },
              {
                objectID: 'c2',
                created_at_i: 1790000100,
                comment_text: 'Intern role at a startup.\nhttps://jobs.lever.co/startupco/apply\nTypeScript, Go',
              },
              {
                objectID: 'c3',
                created_at_i: 1790000200,
                comment_text: 'No link here, just text about hiring.',
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const result = await list();

    expect(result).toHaveLength(3);
    // ATS link in comment text becomes the candidate url
    expect(result[0]).toMatchObject({
      title: 'We are hiring!',
      url: 'https://boards.greenhouse.io/acme/jobs/1',
    });
    expect(result[0].snippet.length).toBeLessThanOrEqual(200);
    // Lever ATS link
    expect(result[1].url).toBe('https://jobs.lever.co/startupco/apply');
    // No link → HN permalink
    expect(result[2].url).toBe('https://news.ycombinator.com/item?id=c3');
    expect(result[2].title).toBe('No link here, just text about hiring.');
  });

  it('filters comments by created_at_i watermark (older comments excluded)', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hits: [{ objectID: 'thread-42' }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            objectID: 'thread-42',
            children: [
              { objectID: 'old', created_at_i: 1000000000, comment_text: 'Old job\nhttps://boards.greenhouse.io/old/jobs/1' },
              { objectID: 'new', created_at_i: 1790000000, comment_text: 'New job\nhttps://jobs.lever.co/new/apply' },
            ],
          }),
          { status: 200 },
        ),
      );

    // since floor: only comments after this date
    const since = new Date('2026-01-01T00:00:00Z'); // epoch ~1767225600
    const result = await list({ since });

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://jobs.lever.co/new/apply');
  });

  it('returns empty array when thread search fails', async () => {
    mockFetch.mockResolvedValueOnce(new Response('fail', { status: 502 }));
    const result = await list();
    expect(result).toEqual([]);
  });

  it('returns empty array when item tree fetch fails', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hits: [{ objectID: 'thread-42' }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('fail', { status: 502 }));
    const result = await list();
    expect(result).toEqual([]);
  });

  it('skips null/empty comment bodies instead of crashing', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hits: [{ objectID: 'thread-42' }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            objectID: 'thread-42',
            children: [
              { objectID: 'null-body', created_at_i: 1790000001, comment_text: null },
              { objectID: 'missing-body', created_at_i: 1790000002 },
              {
                objectID: 'valid',
                created_at_i: 1790000003,
                comment_text: 'Real job\nhttps://jobs.lever.co/real/apply',
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const result = await list();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'Real job',
      url: 'https://jobs.lever.co/real/apply',
    });
  });

  it('returns empty array when thread has no children', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hits: [{ objectID: 'thread-42' }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ objectID: 'thread-42', children: [] }), {
          status: 200,
        }),
      );
    const result = await list();
    expect(result).toEqual([]);
  });
});
