// D-04 listing screen — pure zero-fetch senior reject + flag-only pre-detectors.
//
// screenListing({title, snippet}) -> {reject: {reason: 'senior_role'} | null; flags: string[]}
// Zero I/O, zero fetch, no LLM. zod validates input at the boundary.
//
// Senior reject (D-04): whole-word, case-insensitive title match for
// senior/staff/principal/lead/manager/director, plus unambiguous snippet
// patterns '3+ years' / '5+ years' / 'minimum 3 years' / 'minimum 5 years'.
// Borderline titles (Engineer II, SDE-2, '0–3 yrs') deliberately return
// reject: null so the pipeline fetches and audits them.
//
// Flags (never a reject): cheap D-07 scam pre-detectors + D-08 geo pre-
// detectors. Flags are string class names for telemetry only — they never
// auto-reject at listing stage (T-05-16, T-05-17 mitigations).

import * as z from 'zod';

const ScreenInput = z.object({
  title: z.string(),
  snippet: z.string(),
});

export type ScreenInput = z.infer<typeof ScreenInput>;

export interface ScreenResult {
  reject: { reason: 'senior_role' } | null;
  flags: string[];
}

// ---------------------------------------------------------------------------
// Senior whole-word title match (D-04)
// ---------------------------------------------------------------------------

const SENIOR_TITLE_WORDS = [
  'senior',
  'staff',
  'principal',
  'lead',
  'manager',
  'director',
] as const;

const SENIOR_TITLE_RE = new RegExp(
  `\\b(${SENIOR_TITLE_WORDS.join('|')})\\b`,
  'i',
);

// Snippet patterns for unambiguous experience (D-04).
const SNIPPET_SENIOR_RE = /\b(?:3\+|5\+)\s*years\b/i;
const SNIPPET_MIN_YEARS_RE = /minimum\s+(?:3|5)\s*years\b/i;

// ---------------------------------------------------------------------------
// Scam flag classes (D-07) — flag only, never reject
// ---------------------------------------------------------------------------

export const SCAM_FLAG_CLASSES = [
  'scam_training_fee',
  'scam_registration_deposit',
  'scam_pay_to_join',
  'scam_chat_only',
  'scam_missing_identity',
  'scam_earn_per_day',
] as const;

export type ScamFlagClass = (typeof SCAM_FLAG_CLASSES)[number];

const SCAM_DETECTORS: Array<{ cls: ScamFlagClass; re: RegExp }> = [
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

// ---------------------------------------------------------------------------
// Geo flag classes (D-08) — flag only, never reject
// ---------------------------------------------------------------------------

export const GEO_FLAG_CLASSES = ['geo_us_only', 'geo_emea_only', 'work_auth_required'] as const;

export type GeoFlagClass = (typeof GEO_FLAG_CLASSES)[number];

const GEO_DETECTORS: Array<{ cls: GeoFlagClass; re: RegExp }> = [
  { cls: 'geo_us_only', re: /\bUS-?only\b|US only|based in (?:the )?US\b/i },
  {
    cls: 'geo_emea_only',
    re: /\bEMEA-?only\b|EMEA candidates? only|EMEA only/i,
  },
  {
    cls: 'work_auth_required',
    re: /authorized to work in (?:the )?(?:US|USA|United States)|work authorization required|work-authorization-required/i,
  },
];

// ---------------------------------------------------------------------------
// screenListing — pure predicate
// ---------------------------------------------------------------------------

/**
 * Zero-fetch listing screen. Returns a senior_role reject for unambiguous
 * senior markers, plus flag-only scam/geo class names for telemetry.
 * Flags never cause a reject — they are telemetry only.
 */
export function screenListing(input: { title: string; snippet: string }): ScreenResult {
  const parsed = ScreenInput.parse(input);
  const { title, snippet } = parsed;

  const isSeniorTitle = SENIOR_TITLE_RE.test(title);
  const isSeniorSnippet = SNIPPET_SENIOR_RE.test(snippet) || SNIPPET_MIN_YEARS_RE.test(snippet);

  const reject = isSeniorTitle || isSeniorSnippet ? { reason: 'senior_role' as const } : null;

  const flags: string[] = [];

  for (const { cls, re } of SCAM_DETECTORS) {
    if (re.test(title) || re.test(snippet)) {
      flags.push(cls);
    }
  }

  for (const { cls, re } of GEO_DETECTORS) {
    if (re.test(title) || re.test(snippet)) {
      flags.push(cls);
    }
  }

  return { reject, flags };
}
