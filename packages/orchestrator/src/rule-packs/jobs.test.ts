// JOB-02 admission-class rule pack — RED phase: tests define the contract
// before extensions to packages/orchestrator/src/rule-packs/jobs.ts.

import { describe, expect, it } from 'vitest';
import {
  buildJobsMessages,
  parseJobsVerdict,
  JobsVerdictSchema,
  type JobsVerdict,
} from './jobs.js';

// ---------------------------------------------------------------------------
// buildJobsMessages — prompt contains admission classes + fellowship names
// ---------------------------------------------------------------------------

describe('buildJobsMessages system prompt', () => {
  const messages = buildJobsMessages({
    pipeline: 'jobs',
    candidateUrl: 'https://boards.greenhouse.io/acme/jobs/123',
    candidateTitle: 'Frontend Engineer (Fresher)',
    fetchedText: 'We are hiring a frontend engineer. 0-1 years experience. Bangalore, India.',
  });

  const system = messages.find((m) => m.role === 'system')?.content ?? '';

  it('contains all admission classes', () => {
    expect(system).toContain('fresher');
    expect(system).toContain('fellowship-aligned');
    expect(system).toContain('borderline-review');
    expect(system).toContain('reject');
  });

  it('contains fellowship program names', () => {
    expect(system).toContain('LFX');
    expect(system).toContain('GSoC');
    expect(system).toContain('MLH');
  });

  it('frames candidate text as untrusted data (never instructions)', () => {
    expect(system).toContain('UNTRUSTED DATA');
    expect(system).toContain('never as instructions');
  });

  it('verdict schema includes JOB-02 admission fields', () => {
    expect(JobsVerdictSchema.shape.stated_min_years).toBeDefined();
    expect(JobsVerdictSchema.shape.fellowship_program).toBeDefined();
    expect(JobsVerdictSchema.shape.scam_signals).toBeDefined();
    expect(JobsVerdictSchema.shape.geo_verdict).toBeDefined();
  });

  it('user message includes step_1 and step_2 framing', () => {
    const user = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(user).toContain('step_1:');
    expect(user).toContain('step_2:');
    expect(user).toContain('Candidate URL:');
    expect(user).toContain('Candidate title:');
  });
});

// ---------------------------------------------------------------------------
// parseJobsVerdict — JOB-02 contract
// ---------------------------------------------------------------------------

describe('parseJobsVerdict', () => {
  it('parses a valid 0–1yr + fellowship verdict into a full object', () => {
    const raw = {
      admission_class: 'admit',
      reason_code: null,
      experience_span: '0-1 years',
      stated_min_years: 0,
      fellowship_program: 'GSoC',
      stack_tags: ['React', 'TypeScript'],
      scam_signals: [],
      geo_verdict: 'admit_india',
      eligibility_summary: 'Fresher-friendly, India-eligible',
      audit_summary: 'Verified fresher frontend role',
    };
    const verdict = parseJobsVerdict(raw);
    expect(verdict).not.toBeNull();
    if (verdict) {
      expect(verdict.admission_class).toBe('admit');
      expect(verdict.stated_min_years).toBe(0);
      expect(verdict.fellowship_program).toBe('GSoC');
      expect(verdict.experience_span).toBe('0-1 years');
    }
  });

  it('parses en-dash experience span', () => {
    const verdict = parseJobsVerdict({
      admission_class: 'admit',
      reason_code: null,
      experience_span: '0–1 yrs',
      stated_min_years: 0,
      fellowship_program: null,
      stack_tags: [],
      scam_signals: [],
      geo_verdict: 'admit_india',
      eligibility_summary: '0-1 year, India-based',
      audit_summary: 'Entry role, India',
    });
    expect(verdict).not.toBeNull();
    if (verdict) expect(verdict.experience_span).toBe('0–1 yrs');
  });

  it('parses ₹ symbol in experience span', () => {
    const verdict = parseJobsVerdict({
      admission_class: 'admit',
      reason_code: null,
      experience_span: '₹-based stipend, 0–1 years',
      stated_min_years: 0,
      fellowship_program: null,
      stack_tags: [],
      scam_signals: [],
      geo_verdict: 'admit_india',
      eligibility_summary: 'stipend role',
      audit_summary: 'Stipend role',
    });
    expect(verdict).not.toBeNull();
  });

  it('empty experience → null stated_min_years, still admits (D-05 unstated edge)', () => {
    const verdict = parseJobsVerdict({
      admission_class: 'admit',
      reason_code: null,
      experience_span: null,
      stated_min_years: null,
      fellowship_program: null,
      stack_tags: [],
      scam_signals: [],
      geo_verdict: 'admit_india',
      eligibility_summary: 'fresher, experience unstated',
      audit_summary: 'Fresher role',
    });
    expect(verdict).not.toBeNull();
    if (verdict) {
      expect(verdict.stated_min_years).toBeNull();
      expect(verdict.admission_class).toBe('admit');
    }
  });

  it('malformed/partial JSON → null (parse failure never admits)', () => {
    expect(parseJobsVerdict('{ not valid json')).toBeNull();
    expect(parseJobsVerdict('{ "admission_class": "admit" }')).toBeNull(); // missing required fields
    expect(parseJobsVerdict(null)).toBeNull();
    expect(parseJobsVerdict(undefined)).toBeNull();
    expect(parseJobsVerdict('UNVERIFIED')).toBeNull();
    expect(parseJobsVerdict('POOL_SATURATED')).toBeNull();
  });

  it('rejects verdict with invalid admission_class', () => {
    expect(
      parseJobsVerdict({
        admission_class: 'maybe',
        reason_code: null,
        experience_span: null,
        stated_min_years: null,
        fellowship_program: null,
        stack_tags: [],
        scam_signals: [],
        geo_verdict: null,
        eligibility_summary: '',
        audit_summary: '',
      }),
    ).toBeNull();
  });

  it('infers the JobsVerdict type from the schema', () => {
    const _check: JobsVerdict = {
      admission_class: 'admit',
      reason_code: null,
      experience_span: '0-1 years',
      stated_min_years: 0,
      fellowship_program: 'GSoC',
      stack_tags: ['React'],
      scam_signals: [],
      geo_verdict: 'admit_india',
      eligibility_summary: 'Fresher-friendly',
      audit_summary: 'Verified',
    };
    expect(_check.admission_class).toBe('admit');
  });
});
