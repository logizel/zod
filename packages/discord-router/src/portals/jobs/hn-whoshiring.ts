/** HN "Who is hiring?" portal adapter (Algolia free API, two-call recipe).
 *
 * Emits title+snippet from the listing only (zero fetch on listing).
 * Never throws: non-ok/malformed/empty → [].
 *
 * Step 1: search_by_date for the latest "Who is hiring" thread.
 * Step 2: items/:threadId for the full comment tree.
 * One top-level comment = one candidate.
 * created_at_i watermark persisted via boards state helpers under a per-source key;
 * opts.since is the first-run floor.
 */

import { PollCandidate } from '../ctftime.js';
import { validateUrl } from '@zod/sanitize/fetch';
import { readStateFile, writeWatermark, type BoardsState } from './boards.js';

const ALGOLIA_SEARCH_URL = 'https://hn.algolia.com/api/v1/search_by_date';
const HN_ITEM_URL = (threadId: string) => `https://hn.algolia.com/api/v1/items/${threadId}`;
const HN_PERMALINK = (objectID: string) => `https://news.ycombinator.com/item?id=${objectID}`;
const WATERMARK_KEY = 'hn-whoshiring';

/** Matches absolute http(s) URLs on ATS hosts (or any company domain). */
const ABSOLUTE_URL_RE = /https?:\/\/[^\s<>"')]+/;

function stripHtml(text: string): string {
  return text
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

function firstLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

export interface HnComment {
  objectID: string;
  created_at_i: number;
  comment_text: string;
}

export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  // --- Step 1: find the latest "Who is hiring" thread ---
  let threadId: string | null = null;
  try {
    const searchUrl = new URL(ALGOLIA_SEARCH_URL);
    searchUrl.searchParams.set('tags', 'story,author_whoishiring');
    searchUrl.searchParams.set('query', 'Who is hiring');
    const res = await fetch(searchUrl.toString());
    if (!res.ok) return [];
    const data = (await res.json()) as { hits?: Array<{ objectID: string }> };
    threadId = data.hits?.[0]?.objectID ?? null;
  } catch {
    return [];
  }
  if (!threadId) return [];

  // --- Step 2: load watermark + since floor ---
  const state = readStateFile();
  const persistedWatermark = state?.watermarks?.[WATERMARK_KEY];
  const sinceEpoch = opts?.since ? Math.floor(opts.since.getTime() / 1000) : 0;
  const floor = Math.max(Number(persistedWatermark || 0), sinceEpoch);

  // --- Step 3: fetch full comment tree ---
  let children: HnComment[] = [];
  try {
    const res = await fetch(HN_ITEM_URL(threadId));
    if (!res.ok) return [];
    const data = (await res.json()) as {
      children?: HnComment[];
    };
    children = data.children ?? [];
  } catch {
    return [];
  }

  // Filter by watermark floor (no gap, no repeat across the boundary)
  const filtered = children.filter((c) => c.created_at_i >= floor);

  // Compute new watermark (max created_at_i seen)
  const newWatermark =
    filtered.length > 0
      ? Math.max(...filtered.map((c) => c.created_at_i))
      : Number(persistedWatermark || 0);

  const candidates: PollCandidate[] = [];
  for (const child of filtered) {
    const title = firstLine(child.comment_text);
    const snippet = stripHtml(child.comment_text).slice(0, 200);

    // url = first absolute link found in comment text, else HN permalink
    let url = HN_PERMALINK(child.objectID);
    try {
      const match = child.comment_text.match(ABSOLUTE_URL_RE);
      if (match) {
        const candidateUrl = match[0];
        validateUrl(candidateUrl); // SSRF guard: only http(s), no private hosts
        url = candidateUrl;
      }
    } catch {
      // fall back to HN permalink if the extracted URL fails validation
    }

    candidates.push({ url, title, snippet });
  }

  // Persist new watermark (best-effort; never fails the tick)
  try {
    const updatedState: BoardsState = {
      learned: state?.learned ?? [],
      watermarks: { ...(state?.watermarks ?? {}), [WATERMARK_KEY]: String(newWatermark) },
    };
    writeWatermark(WATERMARK_KEY, String(newWatermark));
  } catch {
    // best-effort
  }

  return candidates;
}
