/** YC Work-at-a-Startup portal adapter (browser mode — PROBE_VERDICT).
 *
 * Logged-out listing probe (2026-10-16): plain fetch to
 * https://www.workatastartup.com/jobs returns a client-rendered React shell
 * with ZERO job/company listing links (all ~150 hrefs are static assets).
 * The browser path (fetchViaBrowser via the shared @zod/browser queue) is
 * required to render the card list.
 *
 * Primary mode: fetchViaBrowser (browser). Never calls chromium.launch().
 *
 * Contract: list() → PollCandidate[] [{url, title, snippet ≤200}].
 * Non-ok/browser error/malformed → [], never throws. Never touches login/apply.
 * Bounded ≤2 pages per poll with contiguous page seams.
 */

import { PollCandidate } from '../ctftime.js';
import { fetchViaBrowser } from '@zod/browser';
import { load } from 'cheerio';

const BASE_URL = 'https://www.workatastartup.com';
const LIST_URL = (page: number) => `${BASE_URL}/jobs?page=${page}`;

// PROBE_VERDICT (2026-10-16): logged-out plain fetch to workatastartup.com/jobs
// returns a client-rendered shell (0 listing cards). Primary mode = browser
// (fetchViaBrowser via the shared @zod/browser queue). The browser is the only
// working path for this surface.
export const YC_PRIMARY_MODE = 'browser' as const;

function parseYCHtml(html: string): PollCandidate[] {
  const candidates: PollCandidate[] = [];
  const $ = load(html);

  // YC Work-at-a-Startup job card selectors (best-effort; surface is
  // client-rendered — verify against live rendered HTML during deployment).
  const cardSelectors = [
    '.job-card', '.job-listing-card', '.job-item', 'article.job',
    '[data-testid="job-card"]', '.startup-card', '.company-card', '.listing-card',
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
      candidates.push({
        url: new URL(href, BASE_URL).href,
        title,
        snippet: snippet.slice(0, 200),
      });
    } catch {
      // skip non-absolutizable URLs
    }
  });

  return candidates;
}

export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  try {
    const candidates: PollCandidate[] = [];

    for (let page = 1; page <= 2; page++) {
      const html = await fetchViaBrowser(LIST_URL(page));
      const pageCandidates = parseYCHtml(html);

      // Contiguous page seam: if a page yields no cards, stop (no more pages)
      if (pageCandidates.length === 0) break;
      candidates.push(...pageCandidates);
    }

    return candidates;
  } catch {
    // Browser error → [] (never throw, tick continues)
    return [];
  }
}
