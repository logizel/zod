/** Greenhouse portal adapter (api mode — official free JSON API).
 *
 * Emits title+snippet from the listing only (zero fetch on listing;
 * full fetch happens only for audit survivors). Never carries the raw
 * `content` field into the candidate — T-05-02 + Pitfall 6.
 *
 * Greenhouse API: boards-api.greenhouse.io/v1/boards/{boardToken}/jobs?content=true
 *
 * Board tokens are configured per employer; this adapter is the template
 * that plan 05-02 fans out across multiple boards via boards.ts.
 */

import { PollCandidate } from '../ctftime.js';
import { validateUrl } from '@zod/sanitize/fetch';

// Greenhouse board token for the configured employer. In production this is
// injected from config; here it is a placeholder for the tracer slice.
const GREENHOUSE_BOARD_TOKEN = 'zod'; // placeholder — replaced by config in 05-02

export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  const url = new URL(
    `https://boards-api.greenhouse.io/v1/boards/${GREENHOUSE_BOARD_TOKEN}/jobs?content=true`,
  );

  const res = await fetch(url.toString());
  if (!res.ok) {
    return []; // non-ok → empty array, never throw
  }

  const data = (await res.json()) as {
    meta: { total: number };
    jobs: Array<{
      id: number;
      title: string;
      updated_at: string;
      location: { name: string } | null;
      absolute_url: string;
      content: string;
    }>;
  };

  return data.jobs
    .filter((job) => {
      // SSRF guard: only allow public https ATS URLs
      try {
        validateUrl(job.absolute_url);
        return true;
      } catch {
        return false;
      }
    })
    .map((job) => ({
      url: job.absolute_url,
      title: job.title,
      snippet: stripHtml(job.content).slice(0, 200),
    }));
}

/** Strip HTML tags from Greenhouse content for the listing snippet. */
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

// detail fetch for a single Greenhouse job (ATS JSON endpoint)
export async function fetchDetailText(cand: PollCandidate): Promise<string | null> {
  try {
    validateUrl(cand.url);
  } catch {
    return null; // unparseable URL → null, tick falls back to facade
  }
  try {
    const res = await fetch(cand.url);
    if (!res.ok) return null;
    const text = await res.text();
    return stripHtml(text).slice(0, 8000) || null;
  } catch {
    return null; // failures degrade to null, never throw
  }
}
