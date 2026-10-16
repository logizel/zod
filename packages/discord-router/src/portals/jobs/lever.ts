/** Lever portal adapter (api mode — official free Postings API).
 *
 * Emits title+snippet from the listing only (zero fetch on listing).
 * Never throws: non-ok/malformed/empty → [].
 *
 * Lever Postings API: https://api.lever.co/v0/postings/{site}?mode=json
 * EU boards: https://api.eu.lever.co/v0/postings/{site}?mode=json
 * Both hosts are tried; the first ok response wins.
 */

import { PollCandidate } from '../ctftime.js';
import { validateUrl } from '@zod/sanitize/fetch';

const DEFAULT_LEVER_SITE = 'zod'; // placeholder — replaced by config in production

const LEVER_HOSTS = ['https://api.lever.co', 'https://api.eu.lever.co'];

export interface LeverPost {
  id: string;
  text: string | null;
  hostedUrl: string | null;
  descriptionPlain: string | null;
  categories?: { location?: string; commitment?: string };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function list(opts?: {
  since?: Date;
  site?: string;
}): Promise<PollCandidate[]> {
  const site = opts?.site ?? DEFAULT_LEVER_SITE;
  let lastError: unknown = null;

  for (const host of LEVER_HOSTS) {
    const url = new URL(`${host}/v0/postings/${site}?mode=json`);
    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as LeverPost[];

      return data
        .filter((post) => {
          // skip entries missing hostedUrl or text (never-throw contract)
          if (!post.hostedUrl || !post.text) return false;
          try {
            validateUrl(post.hostedUrl);
            return true;
          } catch {
            return false;
          }
        })
        .map((post) => ({
          url: post.hostedUrl!,
          title: post.text!,
          snippet: stripHtml(post.descriptionPlain ?? '').slice(0, 200),
        }));
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  return [];
}
