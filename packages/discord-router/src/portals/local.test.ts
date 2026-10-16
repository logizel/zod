import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockFetchViaBrowser: vi.fn(),
  mockEnv: { LOCAL_WATCHLIST_DOMAINS: '' },
}));

const { mockFetch, mockFetchViaBrowser, mockEnv } = hoisted;

vi.mock('@zod/browser', () => ({
  fetchViaBrowser: hoisted.mockFetchViaBrowser as unknown,
}));

vi.mock('@zod/config', () => ({
  env: hoisted.mockEnv as unknown as Record<string, string>,
}));

import {
  localSource,
  getLocalDomains,
  parseEvents,
  DEFAULT_LOCAL_DOMAINS,
  fetchPage,
} from './local.js';

beforeEach(() => {
  hoisted.mockFetch.mockReset();
  hoisted.mockFetchViaBrowser.mockReset();
  hoisted.mockEnv.LOCAL_WATCHLIST_DOMAINS = '';
  vi.stubGlobal('fetch', hoisted.mockFetch as unknown);
});

describe('local source (DK/Udupi CandidateSource)', () => {
  it('getLocalDomains returns code defaults when env override is empty', () => {
    const domains = getLocalDomains();
    expect(domains).toEqual(expect.arrayContaining(DEFAULT_LOCAL_DOMAINS));
    expect(domains.length).toBe(DEFAULT_LOCAL_DOMAINS.length);
  });

  it('getLocalDomains merges env override with dedup', () => {
    hoisted.mockEnv.LOCAL_WATCHLIST_DOMAINS = 'nitk.edu.in, new-college.ac.in , ';
    const domains = getLocalDomains();
    expect(domains).toContain('new-college.ac.in');
    expect(domains.filter((d) => d === 'nitk.edu.in')).toHaveLength(1);
  });

  it('emits PollCandidate[] from mocked HTML event links', async () => {
    hoisted.mockFetch.mockResolvedValueOnce(
      new Response(
        `<html><body>
          <a href="/events/hackathon-2026">NITK Hackathon 2026</a>
          <a href="https://sjec.ac.in/workshop">SJEC Cloud Workshop</a>
          <a href="/about">About Us</a>
        </body></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
    );

    const result = await localSource.list();
    expect(result.length).toBeGreaterThan(0);
    const hackathon = result.find((c) => c.title.includes('Hackathon'));
    expect(hackathon).toBeDefined();
    expect(hackathon!.url).toContain('hackathon-2026');
    expect(result[0]).toMatchObject({
      url: expect.any(String),
      title: expect.any(String),
      snippet: expect.any(String),
      organizer: expect.any(String),
    });
  });

  it('uses fetchViaBrowser for bio-link URLs (D-03)', async () => {
    hoisted.mockFetchViaBrowser.mockResolvedValueOnce(
      '<html><body><a href="/events">Linktree Event</a></body></html>',
    );

    const html = await fetchPage('https://linktr.ee/somecollege');
    expect(hoisted.mockFetchViaBrowser).toHaveBeenCalled();
    expect(html).toContain('Linktree Event');
  });

  it('uses plain fetch for non-bio-link URLs', async () => {
    hoisted.mockFetch.mockResolvedValueOnce(
      new Response('<html><body><a href="/events">College Fest</a></body></html>', { status: 200 }),
    );

    const html = await fetchPage('https://nitk.edu.in');
    expect(hoisted.mockFetch).toHaveBeenCalledWith('https://nitk.edu.in');
    expect(hoisted.mockFetchViaBrowser).not.toHaveBeenCalled();
    expect(html).toContain('College Fest');
  });

  it('returns empty array on non-ok response (error isolation)', async () => {
    hoisted.mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));
    const result = await localSource.list();
    expect(result).toEqual([]);
  });

  it('parseEvents extracts title, url, snippet, organizer', () => {
    const html = `<html><body><a href="/events/fest">NITK Tech Fest 2026</a></body></html>`;
    const result = parseEvents(html, 'nitk.edu.in');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'NITK Tech Fest 2026',
      snippet: 'NITK Tech Fest 2026',
      organizer: 'nitk.edu.in',
    });
    expect(result[0].url).toContain('fest');
  });

  it('parseEvents ignores non-event links', () => {
    const html = `<html><body><a href="/about">About Us</a><a href="/contact">Contact</a></body></html>`;
    const result = parseEvents(html, 'nitk.edu.in');
    expect(result).toHaveLength(0);
  });

  it('fetchPage returns null on fetch failure (never throws)', async () => {
    hoisted.mockFetch.mockRejectedValueOnce(new Error('network down'));
    const result = await fetchPage('https://nitk.edu.in');
    expect(result).toBeNull();
  });
});
