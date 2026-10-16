/** boards.ts — D-02 seed + auto-learn rotation state core (Task 1: state file core).
 *
 * Persists learned ATS board rotation as a block-volume JSON file with atomic
 * tmp+rename writes (no torn reads). Missing/corrupt file degrades to seed-only.
 * Task 2 extends this module with extractBoardUrl / learnBoard / learned-union.
 *
 * SEED_BOARDS: starter curated board list. Live-verify each token with an
 * unauthenticated GET during deployment; a dead token degrades to [] by
 * adapter contract, so verification is hygiene, not correctness.
 */

import { mkdirSync, renameSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
    : require('node:os').homedir(),
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

/** Task 1: seed boards only. Task 2 unions in learned entries. */
export function loadBoards(statePath = DEFAULT_STATE_PATH): readonly SeedBoard[] {
  return [...SEED_BOARDS];
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
