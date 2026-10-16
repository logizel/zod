// Deterministic jobs gates — the final authority over routing and reject codes.
// Mirrors passesPrizeGate (packages/discord-router/src/prize-gate.ts): pure,
// unit-testable, no I/O.
//
// Stack classifier (JOB-04 / JOB-05):
//   Sys/Cloud/DevOps/SRE/K8s/Rust-Go-C → #⚙️-jobs-sys-cloud-devops
//   every other admitted SWE role        → #💼-jobs-general-swe
//   never an empty bucket value

import { getFellowshipAllowlist } from '@zod/config/jobs-policy';

export const BUCKET_JOBS_SYS_CLOUD = '#⚙️-jobs-sys-cloud-devops';
export const BUCKET_JOBS_GENERAL = '#💼-jobs-general-swe';

const SYS_CLOUD_STACKS = new Set([
  'sys', 'cloud', 'devops', 'sre', 'k8s', 'kubernetes', 'rust', 'go', 'golang',
]);

function isSysCloudStack(tag: string): boolean {
  const t = tag.toLowerCase().trim();
  return SYS_CLOUD_STACKS.has(t);
}

export interface JobsGateResult {
  admitted: boolean;
  reasonCode?: string;
  bucketChannel?: string;
}

/**
 * pickJobsBucket: classify stack tags into a bucket channel.
 * Never returns an empty value — defaults to the general bucket.
 */
export function pickJobsBucket(stackTags: string[]): string {
  for (const tag of stackTags) {
    if (isSysCloudStack(tag)) return BUCKET_JOBS_SYS_CLOUD;
  }
  return BUCKET_JOBS_GENERAL;
}

// ---------------------------------------------------------------------------
// D-05: classifyExperience — parse stated minimum years from text
//
// Returns the stated minimum as a number, or null when unstated.
// Parses 'N+ years', 'N–M yrs' (en-dash/hyphen range → minimum),
// 'minimum N years', 'up to N years' (→ 0).
// ---------------------------------------------------------------------------

const EXPERIENCE_PATTERNS: Array<{ re: RegExp; map: (n: number) => number }> = [
  // 'up to N years' → minimum 0
  { re: /up\s+to\s+(\d+)\s*(?:years?|yrs?)\b/i, map: () => 0 },
  // 'minimum N years' → N
  { re: /minimum\s+(\d+)\s*(?:years?|yrs?)\b/i, map: (n) => n },
  // 'N–M yrs' or 'N-M years' (en-dash or hyphen range) → minimum N
  { re: /(\d+)\s*[–-]\s*\d+\s*(?:years?|yrs?)\b/i, map: (n) => n },
  // 'N+ years' → N
  { re: /(\d+)\s*\+\s*(?:years?|yrs?)\b/i, map: (n) => n },
];

export function classifyExperience(text: string): number | null {
  if (!text || typeof text !== 'string') return null;
  for (const { re, map } of EXPERIENCE_PATTERNS) {
    const m = re.exec(text);
    if (m) return map(Number(m[1]));
  }
  return null;
}

/**
 * D-05 fresher gate: admit when minimum is null (unstated) or ≤1 year.
 * Reject only when stated minimum is ≥2 years.
 */
export function admittedByFresherGate(minYears: number | null): boolean {
  return minYears === null || minYears <= 1;
}

// ---------------------------------------------------------------------------
// D-06: fellowship allowlist
// ---------------------------------------------------------------------------

/**
 * isFellowshipProgram: true when `name` is in the allowlist.
 * Defaults to getFellowshipAllowlist() (config default + FELLOWSHIP_ALLOWLIST_EXTRA env).
 * Fail-closed: unknown programs always return false.
 * Case-insensitive, trims whitespace.
 */
export function isFellowshipProgram(name: string, allowlist: string[] = getFellowshipAllowlist()): boolean {
  const normalized = name.trim().toUpperCase();
  if (!normalized) return false;
  return allowlist.includes(normalized);
}

// ---------------------------------------------------------------------------
// D-07: detectScamClasses — enumerated scam class reason codes
// ---------------------------------------------------------------------------

export type ScamReasonCode =
  | 'scam_training_fee'
  | 'scam_registration_deposit'
  | 'scam_pay_to_join'
  | 'scam_chat_only'
  | 'scam_missing_identity'
  | 'scam_earn_per_day';

const SCAM_DETECTORS: Array<{ cls: ScamReasonCode; re: RegExp }> = [
  { cls: 'scam_training_fee', re: /training fee|certification fee/i },
  { cls: 'scam_registration_deposit', re: /registration (?:deposit|charge)/i },
  { cls: 'scam_pay_to_join', re: /pay-?to-?join|pay to join/i },
  {
    cls: 'scam_chat_only',
    re: /telegram-?only|whatsapp-?only|apply via telegram|apply via whatsapp/i,
  },
  { cls: 'scam_missing_identity', re: /no (?:company name|company)|missing company/i },
  { cls: 'scam_earn_per_day', re: /earn\s+(?:₹|rs\.?|inr)?\s*\d+\s*(?:per day|per\/day|daily)/i },
];

/**
 * detectScamClasses: returns the enumerated scam reason codes found in `text`.
 * Pure, no I/O. Empty array when no scam signals.
 */
export function detectScamClasses(text: string): ScamReasonCode[] {
  const found: ScamReasonCode[] = [];
  for (const { cls, re } of SCAM_DETECTORS) {
    if (re.test(text)) {
      found.push(cls);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// D-08: geoVerdict — India-eligible-wide geo gate
// ---------------------------------------------------------------------------

export type GeoReasonCode = 'geo_locked' | 'work_auth_required';

const GEO_LOCKED_RE = /\bus-?only\b|us only|\bemea-?only\b|emea only/i;
const WORK_AUTH_RE =
  /authorized to work in (?:the )?(?:us|usa|united states)|work authorization required|work-authorization-required/i;

/**
 * geoVerdict: admits India on-site/hybrid, Remote—India, Remote—Worldwide.
 * Rejects geo-locked US-only/EMEA-only (geo_locked) and work-authorization
 * required language (work_auth_required).
 * Unstated location is admitted (falls through to auditor).
 */
export function geoVerdict(text: string): { admitted: boolean; reasonCode?: GeoReasonCode } {
  if (!text || typeof text !== 'string') return { admitted: true };

  if (GEO_LOCKED_RE.test(text)) {
    return { admitted: false, reasonCode: 'geo_locked' };
  }

  if (WORK_AUTH_RE.test(text)) {
    return { admitted: false, reasonCode: 'work_auth_required' };
  }

  return { admitted: true };
}

// ---------------------------------------------------------------------------
// evaluateJobsGates — deterministic final authority over LLM verdict + text
// ---------------------------------------------------------------------------

export interface JobsVerdictInput {
  admission_class: string;
  reason_code: string | null;
  stack_tags?: string[];
  stated_min_years?: number | null;
  fellowship_program?: string | null;
  scam_signals?: string[];
  geo_verdict?: string | null;
}

export function evaluateJobsGates(
  verdict: JobsVerdictInput,
  _fetchedText: string,
): JobsGateResult {
  // Honor an LLM-level reject first — reason code passed through verbatim.
  if (verdict.admission_class === 'reject') {
    return {
      admitted: false,
      reasonCode: verdict.reason_code ?? 'rejected',
    };
  }

  // Unverified is not an admit — cannot proceed without a verdict.
  if (verdict.admission_class !== 'admit') {
    return { admitted: false, reasonCode: 'unverified' };
  }

  // --- Deterministic final-authority gates over fetched text ---

  // 1. Fresher gate (D-05): stated minimum ≥2 → reject experience_min_2plus.
  //    Re-parse from text (never trust the LLM's stated_min_years).
  const minYears = classifyExperience(_fetchedText);
  if (minYears !== null && !admittedByFresherGate(minYears)) {
    return { admitted: false, reasonCode: 'experience_min_2plus' };
  }

  // 2. Scam detection (D-07): any enumerated scam class → reject verbatim.
  const scamClasses = detectScamClasses(_fetchedText);
  if (scamClasses.length > 0) {
    return { admitted: false, reasonCode: scamClasses[0] };
  }

  // 3. Geo gate (D-08): geo-locked or work-auth → reject verbatim.
  const geo = geoVerdict(_fetchedText);
  if (!geo.admitted) {
    return { admitted: false, reasonCode: geo.reasonCode };
  }

  // 4. Fellowship (D-06): unpaid + non-fellowship → reject unpaid_non_fellowship.
  //    Checked via the verdict's fellowship_program field; fail-closed.
  if (verdict.fellowship_program !== null && verdict.fellowship_program !== undefined) {
    if (!isFellowshipProgram(verdict.fellowship_program)) {
      return { admitted: false, reasonCode: 'unpaid_non_fellowship' };
    }
  }

  // All gates pass — admit with bucket classification from stack tags.
  const bucketChannel = pickJobsBucket(verdict.stack_tags ?? []);

  return {
    admitted: true,
    bucketChannel,
  };
}

/**
 * evaluateJobsGates final authority over verdict + fetched text.
 * Returns { admitted, reasonCode, bucketChannel }.
 * Gate rejects win over LLM admits; an LLM reject is honored with its reason code.
 * Parse failures are handled by the caller (parseJobsVerdict returns null).
 */
