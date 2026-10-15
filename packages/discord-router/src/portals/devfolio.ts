import { PollCandidate } from './ctftime.js';
import { fetchViaBrowser } from '@zod/browser';
import { load } from 'cheerio';

/**
 * Devfolio portal adapter (scrape mode — headless browser via fetchViaBrowser).
 * Emits title+snippet from the listing page (D-03: zero full fetch before Scout pass).
 */
export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  const html = await fetchViaBrowser('https://devfolio.co/hackathons');
  const $ = load(html);
  const candidates: PollCandidate[] = [];

  $('.hackathon-card, .event-card, article.hackathon').each((_, el) => {
    const $el = $(el);
    const title = $el.find('h3, h2, .title, .hackathon-title').first().text().trim();
    const snippet = $el.find('.description, .snippet, p').first().text().trim();
    const url = $el.find('a').first().attr('href') || '';
    if (!title || !url) return;
    candidates.push({ url: new URL(url, 'https://devfolio.co').href, title, snippet });
  });

  return candidates;
}
