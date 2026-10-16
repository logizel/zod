/** Cuvette portal adapter (browser mode with fallback, assumption A2).
 *
 * Emits title+snippet from the listing only (zero fetch on listing).
 * Never throws: browser error/malformed/empty → [].
 * Bounded pagination: walks at most 2 pages per poll.
 *
 * Assumption A2: Cuvette's listing surface may be login-influenced; the
 * browser-mode path (fetchViaBrowser) is the primary listing path, with a
 * direct-fetch fallback for server-rendered surfaces.
 *
 * Never calls chromium.launch() directly — uses the shared fetchViaBrowser queue.
 */

import { PollCandidate } from '../ctftime.js';
import { fetchViaBrowser } from '@zod/browser';
import { load } from 'cheerio';

const BASE_URL = 'https://cuvette.co';
const LIST_URL = (page: number) => `${BASE_URL}/jobs?page=${page}`;

function parseCuvetteHtml(html: string): PollCandidate[] {
  const candidates: PollCandidate[] = [];
  const $ = load(html);

  $('.listing-card, .job-card, .job-listing-card, article.job, .job-item').each(
    (_, el) => {
      const $el = $(el);
      const title = $el.find('h2, h3, .title, .job-title').first().text().trim();
      const snippet = $el.find('.description, .snippet, p').first().text().trim();
      const href = $el.find('a').first().attr('href') || '';
      if (!title || !href) return; // skip malformed cards
      candidates.push({
        url: new URL(href, BASE_URL).href,
        title,
        snippet: snippet.slice(0, 200),
      });
    },
  );

  return candidates;
}

export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  try {
    const candidates: PollCandidate[] = [];

    for (let page = 1; page <= 2; page++) {
      // Browser mode primary (A2): fetchViaBrowser handles JS-walled surfaces
      const html = await fetchViaBrowser(LIST_URL(page));
      const pageCandidates = parseCuvetteHtml(html);

      if (pageCandidates.length === 0) break; // no more pages
      candidates.push(...pageCandidates);
    }

    return candidates;
  } catch {
    // Browser error → [] (never throw, tick continues)
    return [];
  }
}
