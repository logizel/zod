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

import { readFileSync } from 'node:fs';
import type { PollCandidate, CandidateSource } from '@zod/scheduler/jobs';
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

/** Read and parse the cookie JSON file at tick time (D-07). */
export function readSocialCookies(path: string): SocialCookie[] {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

/** Build a Cookie header string from parsed cookies. */
export function buildCookieHeader(cookies: SocialCookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Extract post-like candidates from a social page response.
 * Best-effort parsing — raw HTML may be client-rendered shells.
 */
function extractCandidatesFromHtml(html: string, sourceUrl: string): PollCandidate[] {
  const candidates: PollCandidate[] = [];
  // Look for common post patterns in server-rendered or embedded JSON
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  const lines = text.split(/\n+/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 10 || trimmed.length > 500) continue;
    // Skip nav/chrome-like noise
    if (/^(home|explore|notifications|messages|profile|search|sign|login|join|post|create)/i.test(trimmed)) continue;
    candidates.push({
      url: sourceUrl,
      title: trimmed.slice(0, 120),
      snippet: trimmed.slice(0, 200),
    });
    if (candidates.length >= 3) break; // cap per page
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

    const header = buildCookieHeader(cookies);
    const candidates: PollCandidate[] = [];
    let actions = 0;

    for (const url of DEFAULT_SOCIAL_URLS) {
      if (actions >= MAX_ACTIONS_PER_TICK) break;

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
