// D-06 fellowship allowlist config — DEFAULT_FELLOWSHIP_ALLOWLIST +
// resolveFellowshipAllowlist + getFellowshipAllowlist.
//
// The allowlist lives in @zod/config (cycle-free: scheduler never imports
// orchestrator). Operator-extensible via FELLOWSHIP_ALLOWLIST_EXTRA env —
// new programs are appended without a release. Fail-closed: unknown
// programs always reject unpaid_non_fellowship (T-05-18 mitigation).

import * as z from 'zod';

// Core structured-fellowship programs whose unpaid listings are admitted
// to audit instead of being rejected with unpaid_non_fellowship (D-06).
export const DEFAULT_FELLOWSHIP_ALLOWLIST = [
  'LFX',
  'GSOC',
  'MLH',
  'OUTREACHY',
  'GIRLS_WHO_CODE',
  'CODE2040',
  'THIEL_FELLOWSHIP',
] as const;

export type FellowshipProgram = (typeof DEFAULT_FELLOWSHIP_ALLOWLIST)[number];

/**
 * Normalize + dedupe + filter fellowship program names.
 * - Trims whitespace, uppercases
 * - Deduplicates across defaults and extra
 * - Filters empty entries
 * Returns a sorted? No — insertion order: defaults first, then extras.
 */
export function resolveFellowshipAllowlist(extraCsv?: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (name: string): void => {
    const normalized = name.trim().toUpperCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  };

  for (const name of DEFAULT_FELLOWSHIP_ALLOWLIST) {
    add(name);
  }
  if (extraCsv) {
    for (const part of extraCsv.split(',')) {
      add(part);
    }
  }

  return result;
}

/**
 * Resolve the effective fellowship allowlist, merging FELLOWSHIP_ALLOWLIST_EXTRA
 * env value so new programs are appended without a code change / release.
 * Reads process.env (the only ambient read; tests pass explicit allowlists
 * to isFellowshipProgram instead).
 */
export function getFellowshipAllowlist(): string[] {
  const extra = process.env.FELLOWSHIP_ALLOWLIST_EXTRA ?? '';
  return resolveFellowshipAllowlist(extra);
}

// Zod schema for the env key (added to EnvSchema in env.ts).
export const FELLOWSHIP_ALLOWLIST_EXTRA_SCHEMA = z.string().default('');
