// Loot vendor watchlist: config-driven polling of vendor program pages for
// credit/voucher/swag signals. Mirrors the portals/* list() → PollCandidate[]
// contract. No new dependencies — T-05-SC (no new installs this plan).
//
// D-12 path 2: curated vendor watchlist polled at low cadence. Fixed hosts
// only — SSRF surface stays config-owned (validateUrl on every fetch target).
// Never throws on fetch/parse failure — a non-ok or throwing entry is skipped.

import { PollCandidate } from '../ctftime.js';
import { validateUrl } from '@zod/sanitize/fetch';

export interface VendorEntry {
  vendor: string;
  url: string;
  mode: 'html' | 'rss';
}

/** Curated vendor program watchlist (D-12). Add/remove entries here — config-only change. */
export const WATCHLIST: readonly VendorEntry[] = [
  { vendor: 'CNCF/LF', url: 'https://training.cncf.io/', mode: 'html' },
  { vendor: 'AWS Student Rewards', url: 'https://aws.amazon.com/education/awseducate/student-rewards/', mode: 'html' },
  { vendor: 'Microsoft Azure', url: 'https://azure.microsoft.com/en-us/free/students/', mode: 'html' },
  { vendor: 'GitHub Education', url: 'https://education.github.com/', mode: 'html' },
  { vendor: 'Oracle', url: 'https://www.oracle.com/iaas/free/', mode: 'html' },
];

/** Keywords that indicate a loot/credit/voucher/swag signal on a vendor page. */
const LOOT_KEYWORDS = ['voucher', 'credit', 'free', 'student', 'claim', 'swag'];

/** Fetch and return the text content of a vendor page (SSRF-guarded). */
async function fetchEntryText(entry: VendorEntry): Promise<string> {
  validateUrl(entry.url);
  const res = await globalThis.fetch(entry.url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return await res.text();
}

/** Extract a loot signal from page text: keyword match + surrounding snippet. */
function extractSignal(text: string): { headline: string; snippet: string } | null {
  const lower = text.toLowerCase();
  const keyword = LOOT_KEYWORDS.find((kw) => lower.includes(kw));
  if (!keyword) return null;

  const idx = lower.indexOf(keyword);
  const start = Math.max(0, idx - 100);
  const end = Math.min(text.length, idx + 200);
  const snippet = text.slice(start, end).trim().replace(/\s+/g, ' ');

  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  const headline = lines.find((l) => l.toLowerCase().includes(keyword)) || lines[0] || '';

  return {
    headline: headline.slice(0, 100),
    snippet: snippet.slice(0, 200),
  };
}

/** Fetch one watchlist entry: returns a PollCandidate if a loot signal is found, null otherwise. */
async function fetchEntry(entry: VendorEntry): Promise<PollCandidate | null> {
  try {
    const text = await fetchEntryText(entry);
    const signal = extractSignal(text);
    if (!signal) return null;
    return {
      url: entry.url,
      title: `${entry.vendor}: ${signal.headline}`,
      snippet: signal.snippet,
    };
  } catch {
    // Non-ok or throwing entry → skip, never throw (isolation).
    return null;
  }
}

/** Fetch all entries in a watchlist (testable with a custom watchlist). */
export async function fetchAll(watchlist: readonly VendorEntry[]): Promise<PollCandidate[]> {
  const results = await Promise.all(watchlist.map((e) => fetchEntry(e)));
  return results.filter((c): c is PollCandidate => c !== null);
}

/** List candidates from the curated WATCHLIST (no args — reads module WATCHLIST). */
export async function list(): Promise<PollCandidate[]> {
  return fetchAll(WATCHLIST);
}

/** Fan out WATCHLIST with URL dedupe (stable order — first occurrence wins). Mirrors getJobCandidates(). */
export async function getLootCandidates(): Promise<PollCandidate[]> {
  const candidates = await fetchAll(WATCHLIST);
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}
