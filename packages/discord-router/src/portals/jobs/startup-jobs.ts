/** startup.jobs portal adapter (XML/RSS mode — native fetch + cheerio xmlMode).
 *
 * Emits title+snippet from the listing only (zero fetch on listing).
 * Never throws: non-ok/malformed/empty → [].
 *
 * Feed: public XML/RSS feed parsed with cheerio xmlMode.
 */

import { PollCandidate } from '../ctftime.js';
import { validateUrl } from '@zod/sanitize/fetch';
import { load } from 'cheerio';

const FEED_URL = 'https://startup.jobs/feed.xml';

export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  const res = await fetch(FEED_URL);
  if (!res.ok) return [];

  const xml = await res.text();
  const $ = load(xml, { xmlMode: true });

  const candidates: PollCandidate[] = [];

  $('item').each((_, el) => {
    const $el = $(el);
    const link = $el.find('link').text().trim();
    const title = $el.find('title').text().trim();
    const description = $el.find('description').text().trim();

    // skip items missing link (never-throw contract)
    if (!link) return;
    try {
      validateUrl(link);
    } catch {
      return;
    }

    candidates.push({
      url: link,
      title,
      snippet: description.slice(0, 200),
    });
  });

  return candidates;
}
