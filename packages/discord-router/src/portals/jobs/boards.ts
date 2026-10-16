/** boards.ts — D-02 seed + auto-learn rotation state.
 *
 * Task 1: state file core — SEED_BOARDS, readStateFile/writeStateFile (atomic
 * tmp+rename), loadBoards (seed only), watermark helpers.
 * Task 2: extractBoardUrl, learnBoard, loadBoards unions seed + learned.
 *
 * Persists learned ATS board rotation as a block-volume JSON file with atomic
 * tmp+rename writes (no torn reads). Missing/corrupt file degrades to seed-only.
 *
 * SEED_BOARDS: starter curated board list. Live-verify each token with an
 * unauthenticated GET during deployment; a dead token degrades to [] by
 * adapter contract, so verification is hygiene, not correctness.
 */

import { mkdirSync, renameSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';

export interface SeedBoard {
  provider: 'greenhouse' | 'lever' | 'ashby';
  slug: string;
}

export interface LearnedBoard extends SeedBoard {
  learnedAt: string;
}

const BoardsStateSchema = z.object({
  learned: z.array(
    z.object({
      provider: z.enum(['greenhouse', 'lever', 'ashby']),
      slug: z.string().min(1),
      learnedAt: z.string().datetime(),
    }),
  ),
  /** source key -> ISO-8601 timestamp (e.g. HN created_at_i watermark) */
  watermarks: z.record(z.string(), z.string()).default({}),
});

export type BoardsState = z.infer<typeof BoardsStateSchema>;

/** Default state file lives on the block volume under $HOME/.zod/. */
export const DEFAULT_STATE_PATH = join(
  typeof process !== 'undefined' && process.env.HOME
    ? process.env.HOME
    : homedir(),
  '.zod',
  'boards-learned.json',
);

/** SEED_BOARDS — ~10 curated ATS board entries (provider + slug). */
export const SEED_BOARDS: readonly SeedBoard[] = [
  { provider: 'greenhouse', slug: 'stripe' },
  { provider: 'greenhouse', slug: 'airbnb' },
  { provider: 'greenhouse', slug: 'shopify' },
  { provider: 'greenhouse', slug: 'figma' },
  { provider: 'greenhouse', slug: 'notion' },
  { provider: 'lever', slug: 'netflix' },
  { provider: 'lever', slug: 'coinbase' },
  { provider: 'lever', slug: 'shopify' },
  { provider: 'ashby', slug: 'linear' },
  { provider: 'ashby', slug: 'perplexity' },
];

/** Atomic read of the boards state file. Corrupt/missing → null. */
export function readStateFile(statePath = DEFAULT_STATE_PATH): BoardsState | null {
  try {
    if (!existsSync(statePath)) return null;
    const raw = readFileSync(statePath, 'utf8');
    return BoardsStateSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Atomic write: tmp file + renameSync (no torn reads). */
export function writeStateFile(state: BoardsState, statePath = DEFAULT_STATE_PATH): void {
  mkdirSync(dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${Date.now()}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, statePath);
}

/** Parse the first ATS board URL from text: boards.greenhouse.io/<slug>,
 * jobs.lever.co/<slug>, or jobs.ashbyhq.com/<slug>. Returns null if none.
 */
const ATS_BOARD_RE =
  /https?:\/\/(boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com)\/([a-z0-9-]+)/i;

export function extractBoardUrl(
  text: string,
): { provider: 'greenhouse' | 'lever' | 'ashby'; slug: string } | null {
  const m = text.match(ATS_BOARD_RE);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const slug = m[2];
  if (host.includes('greenhouse')) return { provider: 'greenhouse', slug };
  if (host.includes('lever.co')) return { provider: 'lever', slug };
  if (host.includes('ashbyhq')) return { provider: 'ashby', slug };
  return null;
}

/** Learn a board from a URL or text: extract the board, append only if not
 * already present in seed or learned (exactly-once), cap the learned set,
 * persist atomically. Returns true if a new board was learned.
 */
const MAX_LEARNED = 200;

export async function learnBoard(
  urlOrText: string,
  statePath = DEFAULT_STATE_PATH,
): Promise<boolean> {
  const extracted = extractBoardUrl(urlOrText);
  if (!extracted) return false;

  const key = `${extracted.provider}:${extracted.slug}`;

  const state = readStateFile(statePath) ?? { learned: [], watermarks: {} };

  // Already in seed → not learned (idempotent)
  if (SEED_BOARDS.some((b) => `${b.provider}:${b.slug}` === key)) return false;

  // Already in learned → not learned (idempotent, exactly-once)
  if (state.learned.some((b) => `${b.provider}:${b.slug}` === key)) return false;

  state.learned.push({ ...extracted, learnedAt: new Date().toISOString() });

  // Cap learned set to bound growth (T-05-11)
  if (state.learned.length > MAX_LEARNED) {
    state.learned = state.learned.slice(-MAX_LEARNED);
  }

  writeStateFile(state, statePath);
  return true;
}

/** Load boards: SEED_BOARDS ∪ learned entries. Seed entries never duplicated.
 * Task 1: seed only. Task 2: includes learned.
 */
export function loadBoards(statePath = DEFAULT_STATE_PATH): readonly SeedBoard[] {
  const state = readStateFile(statePath);
  const learned = state?.learned ?? [];

  const seedKeys = new Set(SEED_BOARDS.map((b) => `${b.provider}:${b.slug}`));

  // Learned entries that aren't already in seed
  const learnedUnique = learned.filter((b) => !seedKeys.has(`${b.provider}:${b.slug}`));

  return [...SEED_BOARDS, ...learnedUnique];
}

/** Read a persisted watermark (per-source key) from the state file. */
export function readWatermark(key: string, statePath = DEFAULT_STATE_PATH): string | null {
  const state = readStateFile(statePath);
  return state?.watermarks?.[key] ?? null;
}

/** Persist a watermark (per-source key) atomically. Best-effort: never throws. */
export function writeWatermark(key: string, value: string, statePath = DEFAULT_STATE_PATH): void {
  try {
    const state = readStateFile(statePath) ?? { learned: [], watermarks: {} };
    state.watermarks = { ...state.watermarks, [key]: value };
    writeStateFile(state, statePath);
  } catch {
    // best-effort; watermark persistence must never fail the tick
  }
}
