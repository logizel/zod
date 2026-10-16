/** Wellfound portal adapter (fetch-facade primary — PROBE_VERDICT).
 *
 * Logged-out listing probe (2026-10-16): plain fetch to
 * https://wellfound.com/jobs returns full server-rendered listing markup
 * (215 anchors, ~110 job/company hrefs, __NEXT_DATA__ present). Native fetch
 * is the primary path.
 *
 * Primary mode: fetch-facade (native fetch). On shell detection (zero anchors
 * in the body), exactly ONE fetchViaBrowser retry via the shared queue.
 * Never calls chromium.launch().
 *
 * Contract: list() → PollCandidate[] [{url, title, snippet ≤200}].
 * Non-ok/shell/empty → [], never throws. Never touches login/apply.
 * Bounded: one listing URL per poll (≤2-page budget respected).
 */

import { PollCandidate } from '../ctftime.js';
import { validateUrl } from '@zod/sanitize/fetch';
import { fetchViaBrowser } from '@zod/browser';
import { load } from 'cheerio';

const LIST_URL = 'https://wellfound.com/jobs';
const BASE_URL = 'https://wellfound.com';

// PROBE_VERDICT (2026-10-16): logged-out plain fetch to wellfound.com/jobs
// carries full listing markup (≈110 job/company hrefs). Primary mode =
// fetch-facade (native fetch). If the response is a client-rendered shell
// (zero anchors), exactly one fetchViaBrowser fallback is attempted.
export const WELLFOUND_PRIMARY_MODE = 'fetch-facade' as const;

function isShell(html: string): boolean {
  const $ = load(html);
  return $('a[href]').length === 0;
}

function parseWellfoundHtml(html: string): PollCandidate[] {
  const candidates: PollCandidate[] = [];
  const $ = load(html);

  // Wellfound listing card selectors (fallback chain to survive layout drift).
  const cardSelectors = [
    '.job-card', '.job-listing', '.job-item', 'article.job',
    '[data-testid="job-card"]', '.company-card', '.startup-card', '.listing-card',
  ];

  $(cardSelectors.join(', ')).each((_, el) => {
    const $el = $(el);
    const title = $el
      .find('h3, h2, .job-title, .title, .company-name, .role-title')
      .first()
      .text()
      .trim();
    const snippet = $el
      .find('.description, .snippet, p, .role-description, .summary')
      .first()
      .text()
      .trim();
    const href = $el.find('a').first().attr('href') || '';
    if (!title || !href) return; // skip malformed cards
    try {
      const abs = new URL(href, BASE_URL).href;
      validateUrl(abs); // SSRF guard: public https only
      candidates.push({ url: abs, title, snippet: snippet.slice(0, 200) });
    } catch {
      // skip invalid/private URLs
    }
  });

  return candidates;
}

export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  try {
    // Path 1: fetch-facade primary (native fetch, logged-out, no credentials)
    const res = await fetch(LIST_URL);
    if (!res.ok) return [];
    const html = await res.text();

    const candidates = parseWellfoundHtml(html);
    if (candidates.length > 0) return candidates;

    // Path 2: shell detection → exactly one browser fallback, no abort
    if (isShell(html)) {
      try {
        const browserHtml = await fetchViaBrowser(LIST_URL);
        return parseWellfoundHtml(browserHtml);
      } catch {
        return [];
      }
    }

    return candidates;
  } catch {
    // Any failure → [] (never throw, tick continues)
    return [];
  }
}
