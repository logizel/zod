// D-05..D-08 deterministic gates — RED phase: tests define the contract
// before the predicate extensions to packages/orchestrator/src/gates/jobs.ts.

import { describe, expect, it } from 'vitest';
import {
  classifyExperience,
  admittedByFresherGate,
  isFellowshipProgram,
  detectScamClasses,
  geoVerdict,
  evaluateJobsGates,
  type JobsGateResult,
} from './jobs.js';

// ---------------------------------------------------------------------------
// classifyExperience (D-05, JOB-02)
// ---------------------------------------------------------------------------

describe('classifyExperience', () => {
  it('parses en-dash range minimum: "2–5 yrs" → 2', () => {
    expect(classifyExperience('2–5 yrs')).toBe(2);
  });

  it('parses hyphen range minimum: "0–2 years" → 0', () => {
    expect(classifyExperience('0–2 years')).toBe(0);
  });

  it('parses "up to N years" as minimum 0', () => {
    expect(classifyExperience('up to 2 years')).toBe(0);
  });

  it('parses "minimum N years"', () => {
    expect(classifyExperience('minimum 2 years')).toBe(2);
  });

  it('parses "N+ years"', () => {
    expect(classifyExperience('3+ years')).toBe(3);
    expect(classifyExperience('5+ years of experience')).toBe(5);
  });

  it('returns null when experience is unstated', () => {
    expect(classifyExperience('fresher-friendly role, no experience required')).toBeNull();
    expect(classifyExperience('entry level position')).toBeNull();
    expect(classifyExperience('')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(classifyExperience('3+ YEARS')).toBe(3);
    expect(classifyExperience('Minimum 2 Years')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// admittedByFresherGate (D-05)
// ---------------------------------------------------------------------------

describe('admittedByFresherGate', () => {
  it.each([
    [null, true],
    [0, true],
    [1, true],
    [2, false],
    [3, false],
    [5, false],
  ])('minYears=%s → %s', (minYears, expected) => {
    expect(admittedByFresherGate(minYears)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// isFellowshipProgram (D-06)
// ---------------------------------------------------------------------------

describe('isFellowshipProgram', () => {
  const defaults = ['LFX', 'GSOC', 'MLH', 'OUTREACHY'];

  it('passes known fellowship programs from the default allowlist', () => {
    expect(isFellowshipProgram('LFX', defaults)).toBe(true);
    expect(isFellowshipProgram('GSoC', defaults)).toBe(true);
    expect(isFellowshipProgram('MLH', defaults)).toBe(true);
    expect(isFellowshipProgram('OUTREACHY', defaults)).toBe(true);
  });

  it('rejects unknown programs (fail-closed)', () => {
    expect(isFellowshipProgram('Some Random Program', defaults)).toBe(false);
    expect(isFellowshipProgram('', defaults)).toBe(false);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isFellowshipProgram('  lfx  ', defaults)).toBe(true);
    expect(isFellowshipProgram('gsoc', defaults)).toBe(true);
  });

  it('defaults to getFellowshipAllowlist() when no allowlist passed', () => {
    expect(isFellowshipProgram('LFX')).toBe(true);
    expect(isFellowshipProgram('GSoC')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectScamClasses (D-07)
// ---------------------------------------------------------------------------

describe('detectScamClasses', () => {
  it('detects training/certification fee → scam_training_fee', () => {
    expect(detectScamClasses('pay training fee to join')).toContain('scam_training_fee');
    expect(detectScamClasses('certification fee required')).toContain('scam_training_fee');
  });

  it('detects registration/deposit charge → scam_registration_deposit', () => {
    expect(detectScamClasses('registration deposit required')).toContain('scam_registration_deposit');
  });

  it('detects pay-to-join → scam_pay_to_join', () => {
    expect(detectScamClasses('pay to join the program')).toContain('scam_pay_to_join');
    expect(detectScamClasses('pay-to-join fee')).toContain('scam_pay_to_join');
  });

  it('detects Telegram/WhatsApp-only → scam_chat_only', () => {
    expect(detectScamClasses('apply via telegram only')).toContain('scam_chat_only');
    expect(detectScamClasses('whatsapp-only application')).toContain('scam_chat_only');
  });

  it('detects missing company identity → scam_missing_identity', () => {
    expect(detectScamClasses('no company name provided')).toContain('scam_missing_identity');
    expect(detectScamClasses('missing company domain')).toContain('scam_missing_identity');
  });

  it('detects earn ₹X/day → scam_earn_per_day', () => {
    expect(detectScamClasses('earn ₹500 per day from home')).toContain('scam_earn_per_day');
  });

  it('returns empty array for clean text', () => {
    expect(detectScamClasses('we are hiring a frontend engineer in bangalore')).toEqual([]);
    expect(detectScamClasses('')).toEqual([]);
  });

  it('detects multiple scam classes in one text', () => {
    const result = detectScamClasses('pay training fee to join, apply via telegram only');
    expect(result).toContain('scam_training_fee');
    expect(result).toContain('scam_chat_only');
  });
});

// ---------------------------------------------------------------------------
// geoVerdict (D-08)
// ---------------------------------------------------------------------------

describe('geoVerdict', () => {
  it.each([
    ['Remote — India', true, undefined],
    ['Remote (Worldwide)', true, undefined],
    ['Remote—Worldwide', true, undefined],
    ['India on-site', true, undefined],
    ['hybrid, India', true, undefined],
    ['Bangalore, India', true, undefined],
  ])('admits India-eligible: %s', (text, admitted, reasonCode) => {
    const result = geoVerdict(text);
    expect(result.admitted).toBe(admitted);
    if (reasonCode !== undefined) expect(result.reasonCode).toBe(reasonCode);
  });

  it.each([
    ['US only', false, 'geo_locked'],
    ['US-only', false, 'geo_locked'],
    ['EMEA only', false, 'geo_locked'],
    ['EMEA-only candidates', false, 'geo_locked'],
    ['must be authorized to work in the US', false, 'work_auth_required'],
    ['work authorization required', false, 'work_auth_required'],
    ['work-authorization-required', false, 'work_auth_required'],
  ])('rejects geo-locked/work-auth: %s → %s', (text, admitted, reasonCode) => {
    const result = geoVerdict(text);
    expect(result.admitted).toBe(admitted);
    expect(result.reasonCode).toBe(reasonCode);
  });

  it('unstated location is not auto-rejected (falls through to auditor)', () => {
    const result = geoVerdict('location not specified');
    expect(result.admitted).toBe(true);
    expect(result.reasonCode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// evaluateJobsGates (final authority)
// ---------------------------------------------------------------------------

describe('evaluateJobsGates', () => {
  it('honors an LLM-level reject with its reason code verbatim', () => {
    const result = evaluateJobsGates(
      { admission_class: 'reject', reason_code: 'scam_pay_to_join' as const, stack_tags: [] },
      'some text',
    );
    const r = result as JobsGateResult;
    expect(r.admitted).toBe(false);
    expect(r.reasonCode).toBe('scam_pay_to_join');
  });

  it('rejects unverified verdicts', () => {
    const result = evaluateJobsGates(
      { admission_class: 'unverified', reason_code: null, stack_tags: [] },
      'some text',
    );
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('unverified');
  });

  it('gate overrides LLM admit when text shows 2+ years experience', () => {
    const result = evaluateJobsGates(
      {
        admission_class: 'admit',
        reason_code: null,
        stack_tags: ['React'],
        stated_min_years: 0,
      } as any,
      'This role requires 2–5 years of experience in React.',
    );
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('experience_min_2plus');
  });

  it('gate overrides LLM admit when text has scam signals', () => {
    const result = evaluateJobsGates(
      {
        admission_class: 'admit',
        reason_code: null,
        stack_tags: [],
        stated_min_years: 0,
      } as any,
      'Pay to join our training program, apply via telegram.',
    );
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('scam_pay_to_join');
  });

  it('gate overrides LLM admit when text is geo-locked', () => {
    const result = evaluateJobsGates(
      {
        admission_class: 'admit',
        reason_code: null,
        stack_tags: [],
        stated_min_years: 0,
      } as any,
      'US only position, based in New York.',
    );
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('geo_locked');
  });

  it('admits clean 0–1yr India role with stack tags and bucket channel', () => {
    const result = evaluateJobsGates(
      {
        admission_class: 'admit',
        reason_code: null,
        stack_tags: ['React', 'Node.js', 'K8s'],
        stated_min_years: 0,
      } as any,
      'Frontend engineer role, 0-1 years experience, Bangalore, India. Stack: React, Node.js.',
    );
    expect(result.admitted).toBe(true);
    expect(result.reasonCode).toBeUndefined();
    expect(result.bucketChannel).toBe('#⚙️-jobs-sys-cloud-devops'); // K8s → sys/cloud
  });

  it('admits non-sys-cloud role to general bucket', () => {
    const result = evaluateJobsGates(
      {
        admission_class: 'admit',
        reason_code: null,
        stack_tags: ['React', 'TypeScript'],
        stated_min_years: 1,
      } as any,
      'Junior frontend role, 1 year experience, remote India.',
    );
    expect(result.admitted).toBe(true);
    expect(result.bucketChannel).toBe('#💼-jobs-general-swe');
  });
});
