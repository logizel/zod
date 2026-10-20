/**
 * Taste Rule Application Module (MEM-04, D-12, D-13).
 *
 * Hybrid model:
 *   - BLOCK rules = pre-scoring filter (checked before LLM runs; auto-rejects
 *     + tombstones, never reaches the auditor — saves free-tier LLM quota)
 *   - BOOST/WEIGHT/CUSTOM rules = system-prompt injection (appended to the
 *     auditor's system prompt as advisory signals; LLM retains final judgment)
 *
 * Precedence (reconciled D-12 + D-13):
 *   1. Hard compliance gates FIRST (mission-non-negotiable — cannot be
 *      overridden by any taste rule).
 *   2. Taste BLOCK pre-scoring filter SECOND (overrides soft/personal gates
 *      only — NOT hard compliance gates).
 *   3. Soft gates THIRD.
 *
 * All dependencies are injectable for testing.
 */

import { hashUrl, normalizeUrl } from '@zod/dedup';
import type { TasteRule } from '@zod/db-hot/schema';

export interface PollCandidate {
  url: string;
  title: string;
  snippet: string;
}

export interface PbLike {
  collection(name: string): {
    getList?: (page: number, perPage: number, opts?: unknown) => Promise<{ items: unknown[]; totalItems: number }>;
    create?: (data: Record<string, unknown>) => Promise<unknown>;
    update?: (id: string, data: Record<string, unknown>) => Promise<void>;
  };
}

/** Load all taste_rules rows from PocketBase (fresh per audit cycle). */
export async function loadTasteRules(pb: PbLike): Promise<TasteRule[]> {
  try {
    const coll = pb.collection('taste_rules');
    if (!coll || typeof coll.getList !== 'function') {
      return [];
    }
    const page = await coll.getList(1, 200, { sort: '-created' });
    return (page.items ?? []) as TasteRule[];
  } catch {
    // taste_rules collection not available — degrade gracefully (no rules)
    return [];
  }
}

/**
 * Pre-scoring filter: check BLOCK rules against each candidate.
 * A BLOCK rule matches when the candidate title or snippet contains the
 * rule text (case-insensitive substring match).
 */
export function checkBlockRules(
  candidates: PollCandidate[],
  rules: TasteRule[],
): { blocked: PollCandidate[]; passed: PollCandidate[] } {
  const blockRules = rules.filter((r) => r.kind === 'BLOCK');
  const blocked: PollCandidate[] = [];
  const passed: PollCandidate[] = [];

  for (const cand of candidates) {
    const isBlocked = blockRules.some((rule) => {
      const ruleText = rule.rule.toLowerCase();
      return (
        cand.title.toLowerCase().includes(ruleText) ||
        cand.snippet.toLowerCase().includes(ruleText)
      );
    });
    if (isBlocked) blocked.push(cand);
    else passed.push(cand);
  }

  return { blocked, passed };
}

/**
 * Build advisory system-prompt injection from BOOST/WEIGHT/CUSTOM rules.
 * Returns empty string when no advisory rules exist.
 */
export function buildTastePromptInjection(rules: TasteRule[]): string {
  const advisoryRules = rules.filter(
    (r) => r.kind === 'BOOST' || r.kind === 'WEIGHT' || r.kind === 'CUSTOM',
  );
  if (advisoryRules.length === 0) return '';
  return (
    '\n\nOperator taste rules (advisory, not authoritative):\n' +
    advisoryRules.map((r) => `- ${r.kind}: ${r.rule} (weight: ${r.weight})`).join('\n')
  );
}

/**
 * Hard compliance gates — evaluated before taste rules (D-13 precedence).
 * These are mission-non-negotiable and cannot be overridden by taste rules.
 * Checked on candidate title + fetched text before the LLM runs.
 *
 * Covers: pay-to-training, US/EU-only swag, 2+yr experience roles.
 */
export function checkHardComplianceGates(
  candidateTitle: string,
  fetchedText: string,
): { blocked: boolean; reason: string } | null {
  const text = (candidateTitle + ' ' + fetchedText).toLowerCase();

  // Pay-to-training / scam training fee patterns (D-07)
  if (/training fee|certification fee|pay-?to-?join|pay to join/i.test(text)) {
    return { blocked: true, reason: 'pay_to_training' };
  }

  // US/EU-only swag / geo-locked patterns (D-08)
  if (/\bus-?only\b|us only|\bemea-?only\b|emea only/i.test(text)) {
    return { blocked: true, reason: 'us_eu_only_swag' };
  }

  // 2+yr experience roles (D-05 fresher gate pattern)
  if (
    /\b(2\+|3\+|5\+|7\+|10\+)\s*(years?|yrs?)\b/i.test(text) ||
    /\b(senior|lead|manager|principal|staff)\b.*\byears?\b/i.test(text)
  ) {
    return { blocked: true, reason: 'experience_min_2plus' };
  }

  return null;
}

/**
 * Full pre-scoring flow: check BLOCK rules, tombstone blocked candidates,
 * return only passed candidates.
 *
 * The `url` parameter is the candidate URL used for tombstone hashing.
 */
export async function applyTastePreScoring(
  candidates: PollCandidate[],
  rules: TasteRule[],
  pb: PbLike,
  url: string,
): Promise<PollCandidate[]> {
  const { blocked, passed } = checkBlockRules(candidates, rules);
  const urlHash = hashUrl(normalizeUrl(url));

  for (const _cand of blocked) {
    const coll = pb.collection('tombstone_ledger');
    if (typeof coll.create !== 'function') {
      throw new Error('tombstone_ledger.create is not available');
    }
    await coll.create({
      url_hash: urlHash,
      fingerprint: urlHash,
      terminal_status: 'taste_blocked',
      source: 'taste_rule',
      decided_at: new Date().toISOString(),
    });
  }

  return passed;
}
