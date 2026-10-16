// Fuzzy merge layer (D-09, D-10, D-11): bounded cross-portal duplicate
// detection extending the exact-hash two-tier precheck.
//
// Merge gate (ALL must hold): normalized-title Dice ≥ MERGE_THRESHOLD (0.9)
// AND organizer/company evidence matches on both sides AND ±3-day date window.
// Below the bar → possible_dupe flag only, never a merge.
//
// The MergeStore port is structural — this module imports nothing from
// db-hot/db-cold. createMergeStore wires PB/cold at the scheduler layer.

import { stringSimilarity as similarity } from 'string-similarity-js';
import { hashUrl, normalizeUrl } from './fingerprint.js';

export const MERGE_THRESHOLD = 0.9;
export const MERGE_FLAG_THRESHOLD = 0.7;

export interface MergeInput {
  pipeline: 'events' | 'jobs';
  title: string;
  url: string;
  organizer?: string;
  dateMs?: number;
  location?: string;
}

export interface MergeCandidate {
  id: string;
  pipeline: 'events' | 'jobs';
  title: string;
  url: string;
  organizer?: string;
  dateMs?: number;
  createdAtMs?: number;
  location?: string;
  links: string[];
}

export interface MergeStore {
  findCandidates(opts: {
    pipeline: 'events' | 'jobs';
    dateMs?: number;
    limit: number;
  }): Promise<MergeCandidate[]>;
  appendLinks(masterId: string, links: string[]): Promise<void>;
  tombstoneMerged(urlHash: string, terminalStatus: 'merged', source: 'merger'): Promise<void>;
}

export interface MergeStoreBacking {
  findCandidates?: MergeStore['findCandidates'];
  appendLinks?: MergeStore['appendLinks'];
  tombstoneMerged?: MergeStore['tombstoneMerged'];
  pb?: { collection(name: string): { getList?(page: number, perPage: number, opts?: unknown): Promise<{ items: any[]; totalItems: number }>; update?(id: string, data: any): Promise<any> } };
  cold?: { create(data: any): Promise<any> };
}

export type MergeResult =
  | { merged: true; masterId: string; links: string[] }
  | { merged: false; possibleDupe: true; masterId?: string }
  | { merged: false; possibleDupe: false };

const WINDOW_DAYS = 3;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;
const SEGMENT_MAX_CHARS = 40;

/** Lowercase, strip 4-digit years, strip non-alphanumeric, collapse whitespace, trim. */
export function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(20\d{2})\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return the leading segment before '|', '—', or ' - ' when the title has
 * ≥2 segments and the segment is ≤40 chars. Otherwise null.
 * This is the organizer/company alias key for company-in-title sources.
 */
export function extractCompany(title: string): string | null {
  const segments = title.split(/\s*\|\s*|\s*—\s*|\s* - \s*/);
  if (segments.length < 2) return null;
  const lead = segments[0]?.trim();
  if (!lead || lead.length > SEGMENT_MAX_CHARS) return null;
  return lead;
}

function effectiveOrganizer(input: MergeInput): string | undefined {
  return input.organizer ?? extractCompany(input.title) ?? undefined;
}

function evidenceMatches(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  return na === nb || similarity(na, nb) >= MERGE_FLAG_THRESHOLD;
}

function inWindow(inputDateMs: number | undefined, masterDateMs: number | undefined): boolean {
  if (masterDateMs === undefined) return false;
  if (inputDateMs !== undefined) {
    return Math.abs(inputDateMs - masterDateMs) <= WINDOW_MS;
  }
  // recent-created fallback: master created within 3 days of now
  return Date.now() - masterDateMs <= WINDOW_MS;
}

export async function attemptMerge(
  input: MergeInput,
  store: MergeStore,
): Promise<MergeResult> {
  // Scope guard: no loot merging (D-11)
  if (input.pipeline !== 'events' && input.pipeline !== 'jobs') {
    return { merged: false, possibleDupe: false };
  }

  const candidates = await store.findCandidates({
    pipeline: input.pipeline,
    dateMs: input.dateMs,
    limit: 50,
  });

  if (candidates.length === 0) {
    return { merged: false, possibleDupe: false };
  }

  const normInputTitle = normalizeTitle(input.title);
  const inputOrg = effectiveOrganizer(input);

  // --- Merge pass: find the best candidate passing all gates ---
  let best: { candidate: MergeCandidate; titleSim: number } | null = null;

  for (const cand of candidates) {
    const titleSim = similarity(normInputTitle, normalizeTitle(cand.title));
    if (titleSim < MERGE_THRESHOLD) continue;

    const candOrg = (cand.organizer ?? extractCompany(cand.title)) ?? undefined;
    if (!evidenceMatches(inputOrg, candOrg)) continue;

    // Jobs: location match under the same both-present/≥0.8 rule
    if (input.pipeline === 'jobs') {
      if (!input.location || !cand.location) continue;
      if (!evidenceMatches(input.location, cand.location)) continue;
    }

    const masterDateMs = cand.dateMs ?? cand.createdAtMs;
    if (!inWindow(input.dateMs, masterDateMs)) continue;

    if (!best || titleSim > best.titleSim) {
      best = { candidate: cand, titleSim };
    }
  }

  if (best) {
    const master = best.candidate;
    const allLinks = [...new Set([...(master.links ?? []), input.url])];
    await store.appendLinks(master.id, allLinks);
    await store.tombstoneMerged(hashUrl(normalizeUrl(input.url)), 'merged', 'merger');
    return { merged: true, masterId: master.id, links: allLinks };
  }

  // --- No merge: possibleDupe if any candidate has title similarity ≥ flag threshold ---
  let bestTitleSim = 0;
  let bestCandidateId: string | undefined;

  for (const cand of candidates) {
    const sim = similarity(normInputTitle, normalizeTitle(cand.title));
    if (sim > bestTitleSim) {
      bestTitleSim = sim;
      bestCandidateId = cand.id;
    }
  }

  if (bestTitleSim >= MERGE_FLAG_THRESHOLD) {
    return { merged: false, possibleDupe: true, masterId: bestCandidateId };
  }

  return { merged: false, possibleDupe: false };
}

export function createMergeStore(backing: MergeStoreBacking): MergeStore {
  const { pb, cold } = backing;

  return {
    findCandidates: backing.findCandidates ?? (async (opts) => {
      if (!pb?.collection) return [];
      try {
        const coll = pb.collection('opportunities');
        const page = await coll.getList?.(1, opts.limit ?? 50, {
          filter: `pipeline = '${opts.pipeline}'`,
          sort: '-created',
        });
        return (page?.items ?? []).map((row: any) => ({
          id: row.id,
          pipeline: row.pipeline,
          title: row.title,
          url: row.candidate_url ?? row.url,
          organizer: row.organizer,
          dateMs: row.dateMs,
          createdAtMs: row.created_at ? new Date(row.created_at).getTime() : undefined,
          links: row.registration_links ?? [],
        }));
      } catch {
        return [];
      }
    }),
    appendLinks: backing.appendLinks ?? (async (_masterId: string, _links: string[]) => {
      if (pb?.collection) {
        const coll = pb.collection('opportunities');
        await coll.update?.(_masterId, { registration_links: _links });
      }
    }),
    tombstoneMerged: backing.tombstoneMerged ?? (async (_urlHash: string, _terminalStatus: 'merged', _source: 'merger') => {
      if (cold?.create) {
        await cold.create({
          url_hash: _urlHash,
          fingerprint: _urlHash,
          terminal_status: _terminalStatus,
          source: _source,
          decided_at: new Date().toISOString(),
        });
      }
    }),
  };
}
