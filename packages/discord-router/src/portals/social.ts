/**
 * Social CandidateSource (ING-05, D-07, D-08, D-09).
 *
 * Polls X/LinkedIn via exported session cookies on disk with conservative
 * human pacing: 30-90s jitter between requests, max 5 actions per tick.
 * Reads cookies from SOCIAL_COOKIES_PATH at tick time (not module load —
 * cookies may be rotated between ticks).
 *
 * No search-index fallback (D-09) — accepts coverage gaps when direct
 * polling is blocked/rate-limited. Zero-cost, simple.
 *
 * Never throws — returns [] on missing cookie file, non-ok responses, or
 * any other failure (error isolation per source).
 */

import { readFileSync, realpathSync } from 'node:fs';
import type { PollCandidate, CandidateSource } from './types.js';
import { env } from '@zod/config';

/** Default X/LinkedIn target URLs (poll-first listing, no detail fetch). */
const DEFAULT_SOCIAL_URLS = [
  'https://x.com/search?q=hackathon+india&src=typed_query&f=live',
  'https://www.linkedin.com/feed/',
];

/** Max actions per tick (D-08 hard constraint). */
const MAX_ACTIONS_PER_TICK = 5;

/** Exported session cookie shape (burner cookies from browser export). */
export interface SocialCookie {
  name: string;
  value: string;
  domain: string;
}

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

/**
 * Per-post URL patterns (X status URLs, LinkedIn posts, etc.).
 * One URL per post — never reuse the listing URL for multiple candidates.
 */
const POST_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com|linkedin\.com)\/(?:[A-Za-z0-9_]{1,15}\/(?:status|posts)\/\d{10,}|in\/[A-Za-z0-9\-_]+\/(?:posts|activity)\/\d{10,})/g;

/**
 * Extract a per-post URL from HTML. Returns the first post-specific URL found,
 * or null when none is present (caller falls back to the listing URL).
 */
function extractPostUrl(html: string): string | null {
  const matches = html.match(POST_URL_RE);
  return matches?.[0] ?? null;
}

/**
 * Extract post-like candidates from a social page response.
 * Best-effort parsing — raw HTML may be client-rendered shells.
 * Each candidate gets its own post URL when one can be extracted;
 * otherwise the listing URL is used as a fallback (single candidate only).
 */
function extractCandidatesFromHtml(html: string, sourceUrl: string): PollCandidate[] {
  const candidates: PollCandidate[] = [];
  const postUrl = extractPostUrl(html);

  // Look for common post patterns in server-rendered or embedded JSON
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  const lines = text.split(/\n+/);
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 10 || trimmed.length > 500) continue;
    // Skip nav/chrome-like noise
    if (/^(home|explore|notifications|messages|profile|search|sign|login|join|post|create)/i.test(trimmed)) continue;
    // One URL per post: use the extracted post URL when available,
    // otherwise use the listing URL (but only emit one candidate in that case).
    candidates.push({
      url: postUrl ?? sourceUrl,
      title: trimmed.slice(0, 120),
      snippet: trimmed.slice(0, 200),
    });
    count += 1;
    if (postUrl) {
      // Post URL found — one candidate per post, stop after first.
      break;
    }
    if (count >= 3) break; // cap per page when no post URL found
  }
  return candidates;
}

/** Social CandidateSource — plugs into runStubTick via candidateSources injection. */
export const socialSource: CandidateSource = {
  pipeline: 'social',
  async list(): Promise<PollCandidate[]> {
    const cookiePath = env.SOCIAL_COOKIES_PATH;
    if (!cookiePath) return [];

    let cookies: SocialCookie[];
    try {
      cookies = readSocialCookies(cookiePath);
    } catch {
      // Missing or malformed cookie file — degrade gracefully (never throw)
      return [];
    }

    const candidates: PollCandidate[] = [];
    let actions = 0;

    for (const url of DEFAULT_SOCIAL_URLS) {
      if (actions >= MAX_ACTIONS_PER_TICK) break;

      // Per-domain filtering: never send X cookies to LinkedIn (or vice
      // versa), and never poll a host anonymously just to hit a login wall.
      const header = buildCookieHeaderFor(cookies, url);
      if (!header) continue;

      // 30-90s jitter between requests (D-08 human pacing)
      const jitter = 30_000 + Math.random() * 60_000;
      await sleep(jitter);

      try {
        const res = await fetch(url, { headers: { Cookie: header } });
        if (!res.ok) continue;

        actions++;

        const text = await res.text();
        candidates.push(...extractCandidatesFromHtml(text, url));
      } catch {
        // Request failed — continue to next URL, never abort the batch
        continue;
      }
    }

    return candidates;
  },
};
