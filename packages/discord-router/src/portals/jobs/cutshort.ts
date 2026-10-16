/** Cutshort portal adapter (scrape mode — headless browser via fetchViaBrowser).
 *
 * Emits title+snippet from the listing only (zero fetch on listing).
 * Never throws: browser error/malformed/empty → [].
 * Bounded pagination: walks at most 2 pages per poll with contiguous page seams.
 *
 * Never calls chromium.launch() directly — uses the shared fetchViaBrowser queue.
 */

import { PollCandidate } from '../ctftime.js';
import { fetchViaBrowser } from '@zod/browser';
import { load } from 'cheerio';

const BASE_URL = 'https://cutshort.io';
const LIST_URL = (page: number) => `${BASE_URL}/jobs?page=${page}`;

export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  try {
    const candidates: PollCandidate[] = [];

    for (let page = 1; page <= 2; page++) {
      const html = await fetchViaBrowser(LIST_URL(page));
      const $ = load(html);

      let pageHadCards = false;
      $('.job-card, .job-listing-card, article.job, .job-item').each((_, el) => {
        const $el = $(el);
        const title = $el.find('h3, h2, .job-title, .title').first().text().trim();
        const snippet = $el.find('.description, .snippet, p').first().text().trim();
        const href = $el.find('a').first().attr('href') || '';
        if (!title || !href) return; // skip malformed cards
        pageHadCards = true;
        candidates.push({
          url: new URL(href, BASE_URL).href,
          title,
          snippet: snippet.slice(0, 200),
        });
      });

      // Contiguous page seam: if a page yields no cards, stop (no more pages)
      if (!pageHadCards) break;
    }

    return candidates;
  } catch {
    // Browser error → [] (never throw, tick continues)
    return [];
  }
}
