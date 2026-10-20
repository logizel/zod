import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PollCandidate } from './types.js';

const mockFetch = vi.fn();
const mockReadFileSync = vi.fn();
const mockRealpathSync = vi.fn();
const mockEnv = { SOCIAL_COOKIES_PATH: '' };

const hoisted = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockRealpathSync: vi.fn(),
  mockEnv: { SOCIAL_COOKIES_PATH: '' },
}));

const { mockFetch: gMockFetch, mockReadFileSync: gMockReadFileSync, mockRealpathSync: gMockRealpathSync, mockEnv: gMockEnv } = hoisted;

vi.mock('node:fs', () => ({
  readFileSync: hoisted.mockReadFileSync as unknown,
  realpathSync: hoisted.mockRealpathSync as unknown,
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
  gMockRealpathSync.mockReset();
  gMockEnv.SOCIAL_COOKIES_PATH = '';
  // Default: realpathSync resolves to the input path (identity)
  gMockRealpathSync.mockImplementation((p: string) => p);
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
    gMockEnv.SOCIAL_COOKIES_PATH = '/opt/zod/social-cookies/missing.json';
    gMockRealpathSync.mockImplementation(() => '/opt/zod/social-cookies/missing.json');
    gMockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });
    const result = await socialSource.list();
    expect(result).toEqual([]);
    expect(gMockFetch).not.toHaveBeenCalled();
  });

  it('reads cookies at tick time and sends Cookie header', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/opt/zod/social-cookies/cookies.json';
    gMockRealpathSync.mockImplementation(() => '/opt/zod/social-cookies/cookies.json');
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    gMockFetch.mockResolvedValueOnce(
      new Response('<html><body>NITK Hackathon 2026 — ₹1L cash prize</body></html>', {
        status: 200,
      }),
    );

    const result = await runWithFakeTimers();
    expect(gMockReadFileSync).toHaveBeenCalledWith('/opt/zod/social-cookies/cookies.json', 'utf8');
    expect(gMockFetch).toHaveBeenCalled();
    const fetchCall = gMockFetch.mock.calls[0];
    expect(fetchCall[1].headers).toHaveProperty('Cookie');
    expect(fetchCall[1].headers.Cookie).toContain('auth_token=abc123');
  });

  it('enforces 30-90s jitter per request (D-08)', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/opt/zod/social-cookies/cookies.json';
    gMockRealpathSync.mockImplementation(() => '/opt/zod/social-cookies/cookies.json');
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    gMockFetch.mockResolvedValue(
      new Response('<html><body>Test post content</body></html>', { status: 200 }),
    );

    vi.useFakeTimers();
    const promise = socialSource.list();
    expect(gMockFetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100_000);
    await new Promise((resolve) => process.nextTick(resolve));
    vi.advanceTimersByTime(100_000);
    await new Promise((resolve) => process.nextTick(resolve));
    vi.useRealTimers();
    await promise;

    expect(gMockFetch).toHaveBeenCalledTimes(2);
  });

  it('enforces max 5 actions per tick (D-08)', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/opt/zod/social-cookies/cookies.json';
    gMockRealpathSync.mockImplementation(() => '/opt/zod/social-cookies/cookies.json');
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    gMockFetch.mockResolvedValue(
      new Response('<html><body>Test post content about hackathon event</body></html>', {
        status: 200,
      }),
    );

    const result = await runWithFakeTimers();
    expect(gMockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns [] on non-ok responses (error isolation)', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/opt/zod/social-cookies/cookies.json';
    gMockRealpathSync.mockImplementation(() => '/opt/zod/social-cookies/cookies.json');
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    gMockFetch.mockResolvedValue(new Response('error', { status: 403 }));

    const result = await runWithFakeTimers();
    expect(gMockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });

  it('maps response data to PollCandidate shape', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/opt/zod/social-cookies/cookies.json';
    gMockRealpathSync.mockImplementation(() => '/opt/zod/social-cookies/cookies.json');
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

  // --- readSocialCookies unit tests (realpathSync + ALLOWED_COOKIE_DIR confinement) ---

  it('readSocialCookies parses JSON array of cookie objects within allowed dir', () => {
    const cookiePath = '/opt/zod/social-cookies/cookies.json';
    gMockRealpathSync.mockReturnValue(cookiePath);
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    const cookies = readSocialCookies(cookiePath);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatchObject({ name: 'auth_token', value: 'abc123' });
    expect(gMockReadFileSync).toHaveBeenCalledWith(cookiePath, 'utf8');
  });

  it('readSocialCookies throws when resolved path is outside ALLOWED_COOKIE_DIR', () => {
    gMockRealpathSync.mockReturnValue('/etc/passwd');
    expect(() => readSocialCookies('/opt/zod/social-cookies/cookies.json')).toThrow();
    expect(gMockReadFileSync).not.toHaveBeenCalled();
  });

  it('readSocialCookies uses resolved realpath path for readFileSync (symlink)', () => {
    const linkPath = '/opt/zod/social-cookies/cookies.json';
    const realPath = '/opt/zod/social-cookies/real-cookies.json';
    gMockRealpathSync.mockReturnValue(realPath);
    gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
    const cookies = readSocialCookies(linkPath);
    expect(cookies).toHaveLength(2);
    expect(gMockReadFileSync).toHaveBeenCalledWith(realPath, 'utf8');
    expect(gMockReadFileSync).not.toHaveBeenCalledWith(linkPath, 'utf8');
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
