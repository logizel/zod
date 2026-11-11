import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockRealpathSync: vi.fn(),
  mockEnv: { SOCIAL_COOKIES_PATH: '' },
  mockBrowserFetch: vi.fn(),
  mockPlainFetch: vi.fn(),
}));

const {
  mockReadFileSync: gMockReadFileSync,
  mockRealpathSync: gMockRealpathSync,
  mockEnv: gMockEnv,
  mockBrowserFetch: gMockBrowserFetch,
  mockPlainFetch: gMockPlainFetch,
} = hoisted;

vi.mock('node:fs', () => ({
  readFileSync: hoisted.mockReadFileSync as unknown,
  realpathSync: hoisted.mockRealpathSync as unknown,
}));

vi.mock('@zod/config', () => ({
  env: hoisted.mockEnv as unknown as Record<string, string>,
}));

vi.mock('@zod/browser', () => ({
  fetchViaBrowserResult: hoisted.mockBrowserFetch as unknown,
}));

import {
  createSocialSource,
  socialSource,
  readSocialCookies,
  buildCookieHeader,
  buildCookieHeaderFor,
  parseXPosts,
  parseLinkedInPosts,
  extractPostUrls,
  sleep,
  type SocialCookie,
  type SocialTelemetryEvent,
} from './social.js';

const COOKIE_PATH = '/opt/zod/social-cookies/cookies.json';

const sampleCookies: SocialCookie[] = [
  { name: 'auth_token', value: 'abc123', domain: 'x.com' },
  { name: 'ct0', value: 'def456', domain: 'x.com' },
  { name: 'li_at', value: 'li789', domain: '.www.linkedin.com' },
  { name: 'JSESSIONID', value: 'js012', domain: '.www.linkedin.com' },
];

const X_HTML = `
<html><body>
  <article data-testid="tweet">
    <div data-testid="tweetText">NITK Hackathon 2026 — ₹1L cash prize, register now</div>
    <a href="/nitk/status/1234567890123456789">10:00 AM</a>
  </article>
  <article data-testid="tweet">
    <div data-testid="tweetText">Manipal tech fest with ₹2L prize pool</div>
    <a href="/manipal/status/2234567890123456789">11:00 AM</a>
  </article>
</body></html>`;

const LI_HTML = `
<html><body>
  <div data-urn="urn:li:activity:7123456789012345678">
    <a href="/feed/update/urn:li:activity:7123456789012345678/">permalink</a>
    <span>Hackathon 2026 at NITK with ₹1L prize</span>
  </div>
</body></html>`;

function browserResult(html: string, overrides: Record<string, unknown> = {}) {
  return {
    html,
    status: 200,
    finalUrl: 'https://example.test/',
    selectorFound: true,
    loginWall: false,
    ...overrides,
  };
}

function makeSource(overrides: Record<string, unknown> = {}) {
  return createSocialSource({
    cookiePath: COOKIE_PATH,
    jitterMs: () => 0,
    fetchBrowser: gMockBrowserFetch as never,
    fetchPlain: gMockPlainFetch as never,
    ...overrides,
  });
}

beforeEach(() => {
  gMockBrowserFetch.mockReset();
  gMockPlainFetch.mockReset();
  gMockReadFileSync.mockReset();
  gMockRealpathSync.mockReset();
  gMockEnv.SOCIAL_COOKIES_PATH = '';
  // Default: realpathSync resolves to the input path (identity)
  gMockRealpathSync.mockImplementation((p: string) => p);
  gMockReadFileSync.mockReturnValue(JSON.stringify(sampleCookies));
  gMockBrowserFetch.mockImplementation(async (url: string) =>
    browserResult(url.includes('linkedin') ? LI_HTML : X_HTML),
  );
});

describe('social source (X/LinkedIn CandidateSource)', () => {
  it('returns [] when SOCIAL_COOKIES_PATH is not set', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '';
    const result = await socialSource.list();
    expect(result).toEqual([]);
    expect(gMockBrowserFetch).not.toHaveBeenCalled();
    expect(gMockPlainFetch).not.toHaveBeenCalled();
  });

  it('returns [] when cookie file is missing', async () => {
    gMockEnv.SOCIAL_COOKIES_PATH = '/opt/zod/social-cookies/missing.json';
    gMockRealpathSync.mockImplementation(() => '/opt/zod/social-cookies/missing.json');
    gMockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });
    const result = await socialSource.list();
    expect(result).toEqual([]);
    expect(gMockBrowserFetch).not.toHaveBeenCalled();
  });

  it('reads cookies at tick time and scopes them per browser target', async () => {
    const source = makeSource();
    const result = await source.list();

    expect(gMockReadFileSync).toHaveBeenCalledWith(COOKIE_PATH, 'utf8');
    expect(gMockBrowserFetch).toHaveBeenCalledTimes(2);

    const [xCall, liCall] = gMockBrowserFetch.mock.calls;
    expect(xCall[0]).toContain('x.com/search');
    expect(xCall[1].cookies.map((c: SocialCookie) => c.name)).toEqual(['auth_token', 'ct0']);
    expect(liCall[0]).toContain('linkedin.com/feed');
    expect(liCall[1].cookies.map((c: SocialCookie) => c.name)).toEqual(['li_at', 'JSESSIONID']);
    expect(result.length).toBeGreaterThan(0);
  });

  it('enforces 30-90s jitter per request (D-08)', async () => {
    // Default jitter (30-90s) with fake timers.
    const source = createSocialSource({
      cookiePath: COOKIE_PATH,
      fetchBrowser: gMockBrowserFetch as never,
      fetchPlain: gMockPlainFetch as never,
    });

    vi.useFakeTimers();
    const promise = source.list();
    expect(gMockBrowserFetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100_000);
    await new Promise((resolve) => process.nextTick(resolve));
    vi.advanceTimersByTime(100_000);
    await new Promise((resolve) => process.nextTick(resolve));
    vi.useRealTimers();
    await promise;

    expect(gMockBrowserFetch).toHaveBeenCalledTimes(2);
  });

  it('enforces max 5 actions per tick (D-08)', async () => {
    const targets = Array.from({ length: 7 }, (_, i) => ({
      key: 'x' as const,
      label: `X${i}`,
      url: `https://x.com/search?q=test${i}`,
      waitForSelector: 'article',
      settleMs: 0,
      parse: parseXPosts,
    }));
    const source = makeSource({ targets });
    await source.list();
    expect(gMockBrowserFetch).toHaveBeenCalledTimes(5);
  });

  it('falls back to plain fetch with a domain-scoped Cookie header', async () => {
    gMockBrowserFetch.mockRejectedValue(new Error('browser boom'));
    gMockPlainFetch.mockImplementation(async (url: string) =>
      new Response(url.includes('linkedin') ? LI_HTML : X_HTML, { status: 200 }),
    );

    const source = makeSource();
    const candidates = await source.list();

    expect(gMockPlainFetch).toHaveBeenCalledTimes(2);
    const [xCall] = gMockPlainFetch.mock.calls;
    expect(xCall[1].headers.Cookie).toContain('auth_token=abc123');
    expect(xCall[1].headers.Cookie).not.toContain('li_at');
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('returns [] when both browser and plain fetch fail', async () => {
    gMockBrowserFetch.mockRejectedValue(new Error('browser boom'));
    gMockPlainFetch.mockResolvedValue(new Response('error', { status: 403 }));

    const source = makeSource();
    const result = await source.list();
    expect(gMockPlainFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });

  it('extracts one candidate per rendered X/LinkedIn post with post URLs', async () => {
    const source = makeSource();
    const candidates = await source.list();

    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.url)).toEqual([
      'https://x.com/nitk/status/1234567890123456789',
      'https://x.com/manipal/status/2234567890123456789',
      'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/',
    ]);
    expect(candidates[0]?.title).toContain('NITK Hackathon');
    expect(new Set(candidates.map((c) => c.url)).size).toBe(candidates.length);
  });

  it('dedupes and caps extracted candidates', async () => {
    const many = Array.from(
      { length: 12 },
      (_, i) => `<article data-testid="tweet">
        <div data-testid="tweetText">Post ${i}</div>
        <a href="/user/status/${1234567890 + i}">t</a>
      </article>`,
    ).join('');
    gMockBrowserFetch.mockResolvedValue(browserResult(`<html><body>${many}</body></html>`));

    const source = makeSource({ maxCandidates: 4 });
    const candidates = await source.list();
    expect(candidates).toHaveLength(4);
    expect(new Set(candidates.map((c) => c.url)).size).toBe(4);
  });

  it('emits start/ok telemetry with url, status, bytes, and post counts', async () => {
    const events: SocialTelemetryEvent[] = [];
    const source = makeSource({ onEvent: (event: SocialTelemetryEvent) => events.push(event) });
    await source.list();

    expect(events[0]).toMatchObject({ tool: 'social.cookies', status: 'ok' });
    const xStart = events.find(
      (e) => e.tool === 'fetch.social' && e.source === 'x' && e.status === 'start',
    );
    const xOk = events.find(
      (e) => e.tool === 'fetch.social' && e.source === 'x' && e.status === 'ok',
    );
    expect(xStart?.url).toContain('x.com/search');
    expect(xOk).toMatchObject({
      httpStatus: 200,
      renderer: 'browser',
      candidates: 2,
    });
    expect(xOk?.bytes).toBeGreaterThan(0);
    expect(xOk?.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('emits a skip event for a target with no matching cookies', async () => {
    gMockReadFileSync.mockReturnValue(
      JSON.stringify([{ name: 'auth_token', value: 'abc', domain: 'x.com' }]),
    );
    const events: SocialTelemetryEvent[] = [];
    const source = makeSource({ onEvent: (event: SocialTelemetryEvent) => events.push(event) });
    await source.list();

    const skip = events.find(
      (e) => e.tool === 'fetch.social' && e.source === 'linkedin' && e.status === 'skip',
    );
    expect(skip?.detail).toContain('no burner cookies');
  });

  it('flags a missing content selector as a probable login wall', async () => {
    gMockBrowserFetch.mockResolvedValue(
      browserResult('<html><body>Log in to X</body></html>', { selectorFound: false }),
    );
    const events: SocialTelemetryEvent[] = [];
    const source = makeSource({ onEvent: (event: SocialTelemetryEvent) => events.push(event) });
    await source.list();

    const ok = events.find(
      (e) => e.tool === 'fetch.social' && e.source === 'x' && e.status === 'ok',
    );
    expect(ok?.detail).toContain('login wall');
    expect(ok?.candidates).toBe(0);
  });

  it('flags an expired LinkedIn session as skip on the login redirect', async () => {
    gMockBrowserFetch.mockImplementation(async (url: string) =>
      url.includes('linkedin')
        ? browserResult('<html><body>Sign in</body></html>', {
            finalUrl:
              'https://www.linkedin.com/login/?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Ffeed%2F',
            loginWall: true,
            selectorFound: true,
          })
        : browserResult(X_HTML),
    );
    const events: SocialTelemetryEvent[] = [];
    const source = makeSource({ onEvent: (event: SocialTelemetryEvent) => events.push(event) });
    const candidates = await source.list();

    const li = events.find(
      (e) => e.tool === 'fetch.social' && e.source === 'linkedin' && e.status !== 'start',
    );
    expect(li?.status).toBe('skip');
    expect(li?.detail).toContain('login wall');
    expect(li?.detail).toContain('/login/');
    expect(li?.output_summary).toContain('session rejected');
    expect(li?.candidates).toBe(0);
    expect(candidates.some((candidate) => candidate.url.includes('linkedin'))).toBe(false);
  });

  it('parses raw-HTML post URLs when the rendered selectors miss', () => {
    const html =
      '<html><body><a href="https://x.com/someone/status/3234567890123456789">t</a></body></html>';
    expect(parseXPosts(html).map((c) => c.url)).toEqual([
      'https://x.com/someone/status/3234567890123456789',
    ]);
    expect(extractPostUrls(html)).toEqual([
      'https://x.com/someone/status/3234567890123456789',
    ]);
  });

  it('parseLinkedInPosts handles relative activity permalinks', () => {
    const posts = parseLinkedInPosts(LI_HTML);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.url).toBe(
      'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/',
    );
  });

  // --- readSocialCookies unit tests (realpathSync + ALLOWED_COOKIE_DIR confinement) ---

  it('readSocialCookies parses JSON array of cookie objects within allowed dir', () => {
    gMockRealpathSync.mockReturnValue(COOKIE_PATH);
    const cookies = readSocialCookies(COOKIE_PATH);
    expect(cookies).toHaveLength(4);
    expect(cookies[0]).toMatchObject({ name: 'auth_token', value: 'abc123' });
    expect(gMockReadFileSync).toHaveBeenCalledWith(COOKIE_PATH, 'utf8');
  });

  it('readSocialCookies throws when resolved path is outside ALLOWED_COOKIE_DIR', () => {
    gMockRealpathSync.mockReturnValue('/etc/passwd');
    expect(() => readSocialCookies(COOKIE_PATH)).toThrow();
  });

  it('readSocialCookies uses resolved realpath path for readFileSync (symlink)', () => {
    const realPath = '/opt/zod/social-cookies/real-cookies.json';
    gMockRealpathSync.mockReturnValue(realPath);
    const cookies = readSocialCookies(COOKIE_PATH);
    expect(cookies).toHaveLength(4);
    expect(gMockReadFileSync).toHaveBeenCalledWith(realPath, 'utf8');
    expect(gMockReadFileSync).not.toHaveBeenCalledWith(COOKIE_PATH, 'utf8');
  });

  it('buildCookieHeader constructs Cookie header string', () => {
    expect(buildCookieHeader(sampleCookies)).toBe(
      'auth_token=abc123; ct0=def456; li_at=li789; JSESSIONID=js012',
    );
  });

  it('buildCookieHeaderFor filters cookies by URL host', () => {
    expect(buildCookieHeaderFor(sampleCookies, 'https://x.com/search?q=test')).toBe(
      'auth_token=abc123; ct0=def456',
    );
    expect(buildCookieHeaderFor(sampleCookies, 'https://www.linkedin.com/feed/')).toBe(
      'li_at=li789; JSESSIONID=js012',
    );
    expect(buildCookieHeaderFor(sampleCookies, 'https://example.com')).toBe('');
  });

  it('buildCookieHeaderFor matches dot-prefixed domains and subdomains', () => {
    const cookies: SocialCookie[] = [
      { name: 'li_at', value: 'li', domain: '.linkedin.com' },
      { name: 'auth_token', value: 'x', domain: '.x.com' },
    ];
    expect(buildCookieHeaderFor(cookies, 'https://www.linkedin.com/feed/')).toBe('li_at=li');
    expect(buildCookieHeaderFor(cookies, 'https://in.linkedin.com/feed/')).toBe('li_at=li');
    expect(buildCookieHeaderFor(cookies, 'https://www.x.com/home')).toBe('auth_token=x');
    expect(buildCookieHeaderFor(cookies, 'https://notx.com/')).toBe('');
  });

  it('sleep resolves', async () => {
    await sleep(1);
    expect(true).toBe(true);
  });
});
