/** Ashby portal adapter (api mode — public posting-api job board).
 *
 * Emits title+snippet from the listing only (zero fetch on listing).
 * Never throws: non-ok/malformed/empty → [].
 *
 * Ashby posting-api: https://api.ashbyhq.com/posting-api/job-board/{boardName}?includeCompensation=true
 */

import { PollCandidate } from '../ctftime.js';
import { validateUrl } from '@zod/sanitize/fetch';

const DEFAULT_ASHBY_BOARD = 'zod'; // placeholder — replaced by config in production

export interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string | null;
  descriptionHtml: string | null;
  location?: string | null;
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
  board?: string;
}): Promise<PollCandidate[]> {
  const board = opts?.board ?? DEFAULT_ASHBY_BOARD;
  const url = new URL(
    `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`,
  );

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const data = (await res.json()) as {
    jobs?: AshbyJob[];
  };

  return (data.jobs ?? [])
    .filter((job) => {
      // skip entries without jobUrl (never-throw contract)
      if (!job.jobUrl) return false;
      try {
        validateUrl(job.jobUrl);
        return true;
      } catch {
        return false;
      }
    })
    .map((job) => ({
      url: job.jobUrl!,
      title: job.title,
      snippet: stripHtml(job.descriptionHtml ?? '').slice(0, 200),
    }));
}
