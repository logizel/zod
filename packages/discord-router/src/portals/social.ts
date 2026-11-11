/**
 * Social CandidateSource (ING-05, D-07, D-08, D-09).
 *
 * Polls X/LinkedIn via exported session cookies on disk with conservative
 * human pacing: 30-90s jitter between requests, max 5 actions per tick.
 * Reads cookies from SOCIAL_COOKIES_PATH at tick time (not module load —
 * cookies may be rotated between ticks).
 *
 * Rendering: X and LinkedIn are client-rendered SPAs, so each listing is
 * loaded through the shared Playwright singleton (@zod/browser) with the
 * domain-scoped burner cookies. A plain `fetch` fallback keeps the source
 * alive when the browser fails, but almost always yields a login shell.
 *
 * Telemetry: `createSocialSource({ onEvent })` emits one event per cookie
 * read and per listing fetch (start/ok/error/skip) with URL, HTTP status,
 * bytes, renderer, and extracted-candidate count. The scheduler wires these
 * into machine_events so the dashboard can show what X/LinkedIn are looking
 * at in real time.
 *
 * No search-index fallback (D-09) — accepts coverage gaps when direct
 * polling is blocked/rate-limited. Zero-cost, simple.
 *
 * Never throws — returns [] on missing cookie file, non-ok responses, or
 * any other failure (error isolation per source).
 */

import { readFileSync, realpathSync } from 'node:fs';
import { load } from 'cheerio';
import { fetchViaBrowserResult, type BrowserFetchResult } from '@zod/browser';
import type { PollCandidate, CandidateSource } from './types.js';
import { env } from '@zod/config';

/** Max actions per tick (D-08 hard constraint). */
const MAX_ACTIONS_PER_TICK = 5;

/** Max candidates emitted per tick across all targets (keeps the audit queue sane). */
const MAX_CANDIDATES_PER_TICK = 8;

/** Exported session cookie shape (burner cookies from browser export). */
export interface SocialCookie {
  name: string;
  value: string;
  domain: string;
}

/** One listing target: where to look + how to parse the rendered page. */
export interface SocialTarget {
  key: 'x' | 'linkedin';
  label: string;
  url: string;
  /** CSS selector that indicates real content rendered (miss = login wall). */
  waitForSelector: string;
  /** Extra hydration time after navigation (ms). */
  settleMs: number;
  /** Redirect target that means the burner session was rejected. */
  loginWallUrl?: RegExp;
  parse: (html: string) => PollCandidate[];
}

/** Fine-grained telemetry event for the machine-glass feed. */
export interface SocialTelemetryEvent {
  tool: 'fetch.social' | 'social.cookies';
  status: 'start' | 'ok' | 'error' | 'skip';
  url: string;
  source: 'x' | 'linkedin' | 'unknown';
  duration_ms?: number;
  httpStatus?: number;
  bytes?: number;
  candidates?: number;
  renderer?: 'browser' | 'fetch' | '';
  detail?: string;
  input_summary?: string;
  output_summary?: string;
}

export type SocialObserver = (event: SocialTelemetryEvent) => void;

/** Sleep for ms ms — exported for testability with fake timers. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ALLOWED_COOKIE_DIR = '/opt/zod/social-cookies';

/** Read and parse the cookie JSON file at tick time (D-07).
 *
 * Resolves symlinks via realpathSync BEFORE any confinement check or file read,
 * then confines the resolved path to ALLOWED_COOKIE_DIR. This prevents symlink-
 * based path traversal (CR-01 / WR-06). May throw — socialSource.list() catches
 * and returns [] to keep the never-throw source contract.
 */
export function readSocialCookies(path: string): SocialCookie[] {
  const resolved = realpathSync(path);
  if (!resolved.startsWith(ALLOWED_COOKIE_DIR + '/')) {
    throw new Error(`Cookie path outside allowed directory: ${resolved}`);
  }
  const raw = readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}

/** Build a Cookie header string from parsed cookies (unfiltered). */
export function buildCookieHeader(cookies: SocialCookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/** True when a cookie scoped to `cookieDomain` applies to `hostname`. */
export function cookieMatchesHost(cookieDomain: string, hostname: string): boolean {
  const domain = cookieDomain.replace(/^\./u, '').toLowerCase();
  const host = hostname.toLowerCase();
  if (!domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

/** Build a Cookie header containing only cookies scoped to `url`'s host. */
export function buildCookieHeaderFor(cookies: SocialCookie[], url: string): string {
  const { hostname } = new URL(url);
  return cookies
    .filter((cookie) => cookieMatchesHost(cookie.domain, hostname))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

// --- Per-post URL shapes ----------------------------------------------------

const X_POST_RE =
  /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{10,}/u;

const LI_POST_RE =
  /^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in\/[A-Za-z0-9\-_]+\/(?:posts|activity)\/\d{10,}|posts\/[^/?#]+-activity-\d+|feed\/update\/urn:li:(?:activity|share|ugcPost):\d+)/u;

/** Global variants used for the raw-HTML fallback path. */
const GLOBAL_POST_RE = new RegExp(
  [
    'https?:\\/\\/(?:www\\.)?(?:x|twitter)\\.com\\/[A-Za-z0-9_]{1,15}\\/status\\/\\d{10,}',
    'https?:\\/\\/(?:[a-z]{2,3}\\.)?linkedin\\.com\\/(?:in\\/[A-Za-z0-9\\-_]+\\/(?:posts|activity)\\/\\d{10,}|posts\\/[^"\'\\s]+-activity-\\d+|feed\\/update\\/urn:li:(?:activity|share|ugcPost):\\d+)',
  ].join('|'),
  'gu',
);

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function absoluteUrl(href: string, fallbackHost: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) return `https://${fallbackHost}${href}`;
  return `https://${fallbackHost}/${href}`;
}

function isPostUrl(url: string): boolean {
  return X_POST_RE.test(url) || LI_POST_RE.test(url);
}

function stripQuery(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/** Extract every post-specific URL from raw HTML (regex fallback). */
export function extractPostUrls(html: string): string[] {
  const found = html.match(GLOBAL_POST_RE) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of found) {
    const url = stripQuery(raw).replace(/\\\//gu, '/');
    if (!isPostUrl(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Parse rendered X search/timeline HTML.
 *
 * Tweets live in `article[data-testid="tweet"]`; the permalink is the first
 * anchor whose href contains `/status/`. Falls back to a raw-HTML URL scan
 * when the selector misses (X A/B markup changes are common).
 */
export function parseXPosts(html: string): PollCandidate[] {
  const $ = load(html);
  const out: PollCandidate[] = [];
  const seen = new Set<string>();

  $('article[data-testid="tweet"]').each((_, el) => {
    const article = $(el);
    const text = normalizeText(
      article.find('[data-testid="tweetText"]').text() || article.text(),
    );
    const href =
      article.find('a[href*="/status/"]').first().attr('href') ??
      article.find('a[href*="/status/"]').attr('href') ??
      '';
    if (!href) return;
    const url = stripQuery(absoluteUrl(href, 'x.com'));
    if (!X_POST_RE.test(url) || seen.has(url)) return;
    seen.add(url);
    out.push({
      url,
      title: text.slice(0, 120) || 'X post',
      snippet: text.slice(0, 240),
    });
  });

  if (out.length === 0) {
    for (const url of extractPostUrls(html)) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: 'X post', snippet: 'X post' });
    }
  }
  return out;
}

/**
 * Parse rendered LinkedIn feed HTML.
 *
 * Feed posts expose permalinks as `a[href*="/feed/update/"]` or
 * `a[href*="/posts/"]`; the surrounding `[data-urn]` / feed card carries the
 * post text. Falls back to a raw-HTML URL scan.
 */
export function parseLinkedInPosts(html: string): PollCandidate[] {
  const $ = load(html);
  const out: PollCandidate[] = [];
  const seen = new Set<string>();

  $('a[href*="/feed/update/"], a[href*="/posts/"]').each((_, el) => {
    const anchor = $(el);
    const href = anchor.attr('href') ?? '';
    if (!href) return;
    const url = stripQuery(absoluteUrl(href, 'www.linkedin.com'));
    if (!LI_POST_RE.test(url) || seen.has(url)) return;
    const container = anchor.closest('[data-urn], .feed-shared-update-v2, article, li');
    const text = normalizeText(container.length ? container.text() : anchor.text());
    seen.add(url);
    out.push({
      url,
      title: text.slice(0, 120) || 'LinkedIn post',
      snippet: text.slice(0, 240),
    });
  });

  if (out.length === 0) {
    for (const url of extractPostUrls(html)) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: 'LinkedIn post', snippet: 'LinkedIn post' });
    }
  }
  return out;
}

/** Default X/LinkedIn targets: search-first, listing-only (no detail fetch). */
export const DEFAULT_SOCIAL_TARGETS: readonly SocialTarget[] = [
  {
    key: 'x',
    label: 'X',
    url: 'https://x.com/search?q=hackathon+india&src=typed_query&f=live',
    waitForSelector: 'article[data-testid="tweet"]',
    settleMs: 1500,
    loginWallUrl: /\/(?:i\/flow\/login|login)\b/u,
    parse: parseXPosts,
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/feed/',
    waitForSelector: '[data-urn], .feed-shared-update-v2',
    settleMs: 1500,
    loginWallUrl:
      /linkedin\.com\/(?:login|authwall|checkpoint|uas\/login|signup)\b/u,
    parse: parseLinkedInPosts,
  },
];

export interface SocialSourceOptions {
  /** Telemetry sink (machine_events wiring lives in the scheduler). */
  onEvent?: SocialObserver;
  /** Browser renderer override (tests). */
  fetchBrowser?: (
    url: string,
    options?: {
      cookies?: SocialCookie[];
      waitForSelector?: string;
      settleMs?: number;
      loginWallUrl?: RegExp;
    },
  ) => Promise<BrowserFetchResult>;
  /** Plain-fetch fallback override (tests). */
  fetchPlain?: (
    url: string,
    init?: { headers?: Record<string, string> },
  ) => Promise<Response>;
  /** Listing targets override (tests / future operator config). */
  targets?: readonly SocialTarget[];
  /** Jitter between requests (ms). Default 30-90s (D-08). */
  jitterMs?: () => number;
  /** Cookie file path override (defaults to env.SOCIAL_COOKIES_PATH). */
  cookiePath?: string;
  /** Candidate cap per tick. Default MAX_CANDIDATES_PER_TICK. */
  maxCandidates?: number;
}

/** Social CandidateSource factory — plugs into runStubTick via candidateSources. */
export function createSocialSource(options: SocialSourceOptions = {}): CandidateSource {
  const targets = options.targets ?? DEFAULT_SOCIAL_TARGETS;
  const jitterMs = options.jitterMs ?? (() => 30_000 + Math.random() * 60_000);
  const maxCandidates = options.maxCandidates ?? MAX_CANDIDATES_PER_TICK;
  const fetchBrowser = options.fetchBrowser ?? fetchViaBrowserResult;
  const fetchPlain =
    options.fetchPlain ?? ((url: string, init?: { headers?: Record<string, string> }) =>
      fetch(url, init as RequestInit));

  const emit = (event: SocialTelemetryEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      // Observability must never break the source.
    }
  };

  return {
    pipeline: 'social',
    async list(): Promise<PollCandidate[]> {
      const cookiePath = options.cookiePath ?? env.SOCIAL_COOKIES_PATH;
      if (!cookiePath) {
        emit({
          tool: 'social.cookies',
          status: 'skip',
          url: '',
          source: 'unknown',
          detail: 'SOCIAL_COOKIES_PATH not set',
        });
        return [];
      }

      let cookies: SocialCookie[];
      try {
        cookies = readSocialCookies(cookiePath);
      } catch (err) {
        // Missing or malformed cookie file — degrade gracefully (never throw)
        emit({
          tool: 'social.cookies',
          status: 'error',
          url: cookiePath,
          source: 'unknown',
          detail: String(err),
        });
        return [];
      }

      emit({
        tool: 'social.cookies',
        status: 'ok',
        url: cookiePath,
        source: 'unknown',
        detail: `${cookies.length} cookie(s) loaded`,
        output_summary: `${cookies.length} cookie(s) loaded`,
      });

      const candidates: PollCandidate[] = [];
      const seen = new Set<string>();
      let actions = 0;

      for (const target of targets) {
        if (actions >= MAX_ACTIONS_PER_TICK) break;
        if (candidates.length >= maxCandidates) break;

        const host = new URL(target.url).hostname;
        const domainCookies = cookies.filter((c) => cookieMatchesHost(c.domain, host));

        // Per-domain filtering: never send X cookies to LinkedIn (or vice
        // versa), and never poll a host anonymously just to hit a login wall.
        if (domainCookies.length === 0) {
          emit({
            tool: 'fetch.social',
            status: 'skip',
            url: target.url,
            source: target.key,
            detail: `no burner cookies scoped to ${host}`,
          });
          continue;
        }

        // 30-90s jitter between requests (D-08 human pacing)
        await sleep(jitterMs());
        actions += 1;
        const startedAt = Date.now();

        emit({
          tool: 'fetch.social',
          status: 'start',
          url: target.url,
          source: target.key,
          detail: `rendering ${target.label} with ${domainCookies.length} cookie(s)`,
        });

        try {
          let html = '';
          let renderer: 'browser' | 'fetch' = 'browser';
          let httpStatus = 0;
          let selectorFound = true;
          let loginWall = false;
          let finalUrl = target.url;
          let browserError: unknown = null;

          try {
            const result = await fetchBrowser(target.url, {
              cookies: domainCookies,
              waitForSelector: target.waitForSelector,
              settleMs: target.settleMs,
              loginWallUrl: target.loginWallUrl,
            });
            html = result.html;
            httpStatus = result.status;
            selectorFound = result.selectorFound;
            finalUrl = result.finalUrl || target.url;
            loginWall =
              result.loginWall === true ||
              (target.loginWallUrl?.test(finalUrl) ?? false);
          } catch (err) {
            browserError = err;
          }

          if (!html) {
            // Plain-fetch fallback: keeps the source alive, but X/LI almost
            // always return a client-rendered shell on this path.
            renderer = 'fetch';
            const res = await fetchPlain(target.url, {
              headers: { Cookie: buildCookieHeaderFor(cookies, target.url) },
            });
            httpStatus = res.status;
            if (res.ok) html = await res.text();
          }

          const parsed = html && !loginWall ? target.parse(html) : [];
          const fresh: PollCandidate[] = [];
          for (const candidate of parsed) {
            if (candidates.length + fresh.length >= maxCandidates) break;
            if (seen.has(candidate.url)) continue;
            seen.add(candidate.url);
            fresh.push(candidate);
          }
          candidates.push(...fresh);

          const detailParts: string[] = [];
          if (browserError) {
            detailParts.push(`browser failed: ${String(browserError)}`);
          }
          detailParts.push(`renderer=${renderer}`);
          if (loginWall) {
            detailParts.push(`login wall: redirected to ${finalUrl} (burner session rejected)`);
          } else if (!selectorFound) {
            detailParts.push('content selector not found (possible login wall)');
          }
          detailParts.push(`${fresh.length} post(s) extracted`);

          emit({
            tool: 'fetch.social',
            status: loginWall ? 'skip' : 'ok',
            url: target.url,
            source: target.key,
            duration_ms: Date.now() - startedAt,
            httpStatus,
            bytes: html.length,
            candidates: fresh.length,
            renderer,
            detail: detailParts.join(' · '),
            output_summary: loginWall
              ? `0 post(s) — ${target.label} session rejected (re-export burner cookies)`
              : `${fresh.length} post(s) extracted from ${target.label}`,
          });
        } catch (err) {
          emit({
            tool: 'fetch.social',
            status: 'error',
            url: target.url,
            source: target.key,
            duration_ms: Date.now() - startedAt,
            detail: String(err),
          });
        }
      }

      return candidates;
    },
  };
}

/** Default instance (no telemetry sink) — tests and non-scheduler callers. */
export const socialSource: CandidateSource = createSocialSource();
