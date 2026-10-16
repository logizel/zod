/** Workday portal adapter (cxs JSON first + browser fallback, assumption A1).
 *
 * Emits title+snippet from the listing only (zero fetch on listing).
 * Never throws: cxs failure/browser error/empty → [].
 *
 * Tries the cxs JSON listing POST first ([ASSUMED A1] — undocumented endpoint,
 * community-observed shape). On any throw or non-ok, degrades to a single
 * fetchViaBrowser listing fallback (D-03) without aborting the tick.
 *
 * Never calls chromium.launch() directly — uses the shared fetchViaBrowser queue.
 */

import { PollCandidate } from '../ctftime.js';
import { validateUrl } from '@zod/sanitize/fetch';
import { fetchViaBrowser } from '@zod/browser';
import { load } from 'cheerio';

export interface WorkdaySite {
  tenant: string;
  wd: string;
  site: string;
}

/** Starter Workday tenants — live-verify during implementation.
 *  [ASSUMED A1] cxs endpoint shape may not match all tenants; browser fallback covers drift.
 */
export const WORKDAY_SITES: readonly WorkdaySite[] = [
  { tenant: 'acme', wd: 'myworkdayjobs', site: 'acme' },
];

const CXS_BODY = JSON.stringify({ limit: 20, offset: 0, searchText: '', appliedFacets: {} });

interface WorkdayJobPosting {
  externalPath: string;
  title: string;
  locationsText?: string;
  postedOn?: string;
}

function mapWorkdayPosting(
  site: WorkdaySite,
  j: WorkdayJobPosting,
): PollCandidate | null {
  if (!j.externalPath || !j.title) return null;
  const url = `https://${site.tenant}.${site.wd}.com/${site.site}${j.externalPath}`;
  try {
    validateUrl(url);
  } catch {
    return null;
  }
  return {
    url,
    title: j.title,
    snippet: `${j.locationsText ?? ''} | ${j.postedOn ?? ''}`
      .replace(/\s*\|\s*$/, '')
      .trim()
    .slice(0, 200),
  };
}

async function tryCxsListing(site: WorkdaySite): Promise<PollCandidate[]> {
  const cxsUrl = `https://${site.tenant}.${site.wd}.com/wday/cxs/${site.tenant}/${site.site}/jobs`;
  const res = await fetch(cxsUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: CXS_BODY,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { jobPostings?: WorkdayJobPosting[] };
  return (data.jobPostings ?? [])
    .map((j) => mapWorkdayPosting(site, j))
    .filter((c): c is PollCandidate => c !== null);
}

async function tryBrowserListing(site: WorkdaySite): Promise<PollCandidate[]> {
  const listingUrl = `https://${site.tenant}.${site.wd}.com/${site.site}`;
  const html = await fetchViaBrowser(listingUrl);
  const $ = load(html);
  const candidates: PollCandidate[] = [];
  const base = `https://${site.tenant}.${site.wd}.com/${site.site}`;

  $('.job-card, .job-listing, .job-item, article').each((_, el) => {
    const $el = $(el);
    const title = $el.find('h3, h2, .job-title, .title').first().text().trim();
    const snippet = $el.find('.description, .snippet, p').first().text().trim();
    const href = $el.find('a').first().attr('href') || '';
    if (!title || !href) return;
    try {
      const absUrl = new URL(href, base).href;
      validateUrl(absUrl);
      candidates.push({ url: absUrl, title, snippet: snippet.slice(0, 200) });
    } catch {
      // skip invalid URLs
    }
  });
  return candidates;
}

export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  // --- Path 1: cxs JSON listing first ([ASSUMED A1]) ---
  for (const site of WORKDAY_SITES) {
    try {
      const candidates = await tryCxsListing(site);
      if (candidates.length > 0) return candidates;
    } catch {
      // cxs throw → try next site
      continue;
    }
  }

  // --- Path 2: D-03 browser fallback — exactly one attempt per site, no abort ---
  for (const site of WORKDAY_SITES) {
    try {
      const candidates = await tryBrowserListing(site);
      if (candidates.length > 0) return candidates;
    } catch {
      continue;
    }
  }

  return [];
}
