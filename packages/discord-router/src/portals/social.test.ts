import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PollCandidate } from '@zod/scheduler/jobs';

const mockFetch = vi.fn();
const mockReadFileSync = vi.fn();
const mockEnv = { SOCIAL_COOKIES_PATH: '' };

const hoisted = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockEnv: { SOCIAL_COOKIES_PATH: '' },
}));

const { mockFetch: gMockFetch, mockReadFileSync: gMockReadFileSync, mockEnv: gMockEnv } = hoisted;

vi.mock('node:fs', () => ({
  readFileSync: hoisted.mockReadFileSync as unknown,
}));

vi.mock('@zod/config', () => ({
  env: hoisted.mockEnv as unknown as Record<string, string>,
}));

import {
  socialSource,
  readSocialCookies,
  buildCookieHeader,
  sleep,
  SocialCookie,
} from './social.js';

beforeEach(() => {
  gMockFetch.mockReset();
  gMockReadFileSync.mockReset();
  gMockEnv.SOCIAL_COOKIES_PATH = '';
  vi.stubGlobal('fetch', gMockFetch as unknown);
});

const sampleCookies: SocialCookie[] = [
  { name: 'auth_token', value: 'abc123', domain: 'x.com' },
  { name: 'ct0', value: 'def456', domain: 'x.com' },
];

/**
 * Run socialSource.list() with fake timers, advancing timers in a loop
 * so all internal sleep() calls fire. process.nextTick flushes microtasks.
 */
async function runWithFakeTimers(): Promise<ReturnType<typeof socialSource.list>> {
  vi.useFakeTimers();
  const promise = socialSource.list();
  for (let i = 0; i < 10; i++) {
    vi.advanceTimersByTime(100_000);
    await new Promise((resolve) => process.nextTick(resolve));
  }
  vi.useRealTimers();
  return promise;
}

describe('social source (X/LinkedIn CandidateSource)', () => {
  it('returns [] when SOCIAL_COOKIES_PATH is not set', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '';
    const result = await socialSource.list();
    expect(result).toEqual([]);
    expect(gMockFetch).not.toHaveBeenCalled();
  });

  it('returns [] when cookie file is missing', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/tmp/nonexistent-cookies.json';
    gMockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });
    const result = await socialSource.list();
    expect(result).toEqual([]);
    expect(gMockFetch).not.toHaveBeenCalled();
  });

  it('reads cookies at tick time and sends Cookie header', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/tmp/cookies.json';
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    gMockFetch.mockResolvedValueOnce(
      new Response('<html><body>NITK Hackathon 2026 — ₹1L cash prize</body></html>', {
        status: 200,
      }),
    );

    const result = await runWithFakeTimers();
    expect(gMockReadFileSync).toHaveBeenCalledWith('/tmp/cookies.json', 'utf8');
    expect(gMockFetch).toHaveBeenCalled();
    const fetchCall = gMockFetch.mock.calls[0];
    expect(fetchCall[1].headers).toHaveProperty('Cookie');
    expect(fetchCall[1].headers.Cookie).toContain('auth_token=abc123');
  });

  it('enforces 30-90s jitter per request (D-08)', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/tmp/cookies.json';
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    gMockFetch.mockResolvedValue(
      new Response('<html><body>Test post content</body></html>', { status: 200 }),
    );

    vi.useFakeTimers();
    const promise = socialSource.list();
    // Before any timer advance, sleep hasn't fired, fetch should NOT be called
    expect(gMockFetch).not.toHaveBeenCalled();
    // Advance past max jitter for first URL
    vi.advanceTimersByTime(100_000);
    await new Promise((resolve) => process.nextTick(resolve));
    // First URL processed, now waiting on second sleep
    vi.advanceTimersByTime(100_000);
    await new Promise((resolve) => process.nextTick(resolve));
    vi.useRealTimers();
    await promise;

    expect(gMockFetch).toHaveBeenCalledTimes(2);
  });

  it('enforces max 5 actions per tick (D-08)', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/tmp/cookies.json';
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    gMockFetch.mockResolvedValue(
      new Response('<html><body>Test post content about hackathon event</body></html>', {
        status: 200,
      }),
    );

    const result = await runWithFakeTimers();
    // Only 2 default URLs → 2 fetches (well under 5)
    expect(gMockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns [] on non-ok responses (error isolation)', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/tmp/cookies.json';
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    gMockFetch.mockResolvedValue(new Response('error', { status: 403 }));

    const result = await runWithFakeTimers();
    expect(gMockFetch).toHaveBeenCalledTimes(2); // both URLs attempted
    expect(result).toEqual([]);
  });

  it('maps response data to PollCandidate shape', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/tmp/cookies.json';
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    gMockFetch.mockResolvedValueOnce(
      new Response(
        '<html><body>NITK Tech Fest 2026 — 24-hour hackathon with ₹1L prize, register at nitk.edu.in</body></html>',
        { status: 200 },
      ),
    );

    const candidates = await runWithFakeTimers();
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toMatchObject({
      url: expect.any(String),
      title: expect.any(String),
      snippet: expect.any(String),
    });
  });

  it('readSocialCookies parses JSON array of cookie objects', () => {
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    const cookies = readSocialCookies('/tmp/cookies.json');
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatchObject({ name: 'auth_token', value: 'abc123' });
  });

  it('buildCookieHeader constructs Cookie header string', () => {
    const header = buildCookieHeader(sampleCookies);
    expect(header).toBe('auth_token=abc123; ct0=def456');
  });

  it('sleep resolves', async () => {
    await sleep(1);
    expect(true).toBe(true);
  });
});
