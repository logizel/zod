/**
 * Local DK/Udupi CandidateSource (ING-02, D-01, D-02, D-03).
 *
 * Crawls DK/Udupi college/community watchlist domains and bio-link pages,
 * emitting PollCandidate[] that feed into the existing runStubTick pipeline
 * via candidateSources injection (pipeline: 'local').
 *
 * Domain inventory is hybrid: code defaults + LOCAL_WATCHLIST_DOMAINS env
 * override (comma-separated, operator-extensible without redeploy).
 *
 * Bio-link pages (JS-rendered) are fetched via the shared Playwright
 * singleton (fetchViaBrowser) — no new browser instance is created.
 *
 * Geo classification (location-primary) is NOT implemented here — that
 * happens at audit time (Plan 02). The source passes location + organizer
 * through on each PollCandidate.
 */

import { load, type CheerioAPI } from 'cheerio';
import { fetchViaBrowser } from '@zod/browser';
import type { PollCandidate, CandidateSource } from './types.js';
import { env } from '@zod/config';

/** Default DK/Udupi college + community watchlist domains (D-01 code defaults). */
export const DEFAULT_LOCAL_DOMAINS = [
  'nitk.edu.in',
  'manipal.edu',
  'nmamit.nitte.edu.in',
  'sjec.ac.in',
  'sahyadri.edu.in',
  'mite.ac.in',
  'ajiet.edu.in',
  'staloysius.edu.in',
  'sosc.org.in',
];

/** Known bio-link / JS-rendered page hosts that need headless rendering (D-03). */
const BIO_LINK_HOSTS = [
  'linktr.ee',
  'carrd.co',
  'beacon.page',
  'bio.link',
  'linktree.com',
];

/**
 * Merge code defaults with LOCAL_WATCHLIST_DOMAINS env override.
 * Split by comma, trim, lowercase, filter empty, dedupe via Set.
 */
export function getLocalDomains(): string[] {
  const extra = env.LOCAL_WATCHLIST_DOMAINS ?? '';
  const extras = extra
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_LOCAL_DOMAINS, ...extras])];
}

function isBioLinkUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BIO_LINK_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

/**
 * Fetch a page: plain fetch for HTML pages, fetchViaBrowser for bio-link
 * JS-rendered pages via the shared Playwright singleton (D-03).
 * Returns null on any failure (never throws — error isolation per source).
 */
export async function fetchPage(url: string): Promise<string | null> {
  try {
    if (isBioLinkUrl(url)) {
      const html = await fetchViaBrowser(url);
      return html ?? null;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Parse event-like links from HTML using cheerio.
 * Extracts title, url, snippet, location (placeholder), organizer (domain).
 * Geo classification is deferred to audit time (D-02).
 */
export function parseEvents(html: string, domain: string): PollCandidate[] {
  const $: CheerioAPI = load(html);
  const candidates: PollCandidate[] = [];
  const seen = new Set<string>();

  $('a').each((_, el) => {
    const $el = $(el);
    const title = $el.text().trim();
    const href = $el.attr('href');
    if (!title || !href) return;

    // Heuristic: event-like links contain relevant keywords.
    const text = title.toLowerCase();
    if (
      !/(fest|event|hackathon|workshop|seminar|conference|tech|cultural|college|symposium|webinar)/.test(
        text,
      )
    ) {
      return;
    }

    const url = href.startsWith('http') ? href : new URL(href, `https://${domain}`).toString();
    if (seen.has(url)) return;
    seen.add(url);

    candidates.push({
      url,
      title: title.slice(0, 200),
      snippet: title.slice(0, 200),
      location: undefined, // populated at audit time (D-02, location-primary)
      organizer: domain,
    });
  });

  return candidates;
}

/** Local CandidateSource — plugs into runStubTick via candidateSources injection. */
export const localSource: CandidateSource = {
  pipeline: 'local',
  async list(): Promise<PollCandidate[]> {
    const domains = getLocalDomains();
    const candidates: PollCandidate[] = [];

    for (const domain of domains) {
      const html = await fetchPage(`https://${domain}`);
      if (!html) continue;
      candidates.push(...parseEvents(html, domain));
    }

    return candidates;
  },
};
