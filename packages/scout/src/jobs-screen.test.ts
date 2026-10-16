// D-04 listing screen — pure zero-fetch senior reject + flag-only pre-detectors.
// RED phase: these tests define the contract before jobs-screen.ts exists.

import { describe, expect, it } from 'vitest';
import { screenListing, SCAM_FLAG_CLASSES, GEO_FLAG_CLASSES } from './jobs-screen.js';

// ---------------------------------------------------------------------------
// Senior whole-word title match (D-04, case-insensitive, word-boundary)
// ---------------------------------------------------------------------------

describe('screenListing senior title predicate', () => {
  it('rejects "Senior Backend Engineer" as senior_role', () => {
    const res = screenListing({ title: 'Senior Backend Engineer', snippet: 'hiring now' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });

  it('rejects "Staff SRE" as senior_role', () => {
    const res = screenListing({ title: 'Staff SRE', snippet: 'site reliability' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });

  it('rejects "Principal Engineer" as senior_role', () => {
    const res = screenListing({ title: 'Principal Engineer', snippet: 'architecture' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });

  it('rejects "Team Lead" as senior_role (whole-word "Lead")', () => {
    const res = screenListing({ title: 'Team Lead', snippet: 'lead a team' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });

  it('rejects "Engineering Manager" as senior_role', () => {
    const res = screenListing({ title: 'Engineering Manager', snippet: 'manage engineers' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });

  it('rejects "Director of Engineering" as senior_role', () => {
    const res = screenListing({ title: 'Director of Engineering', snippet: 'org leadership' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });

  it('rejects "Senior" case-insensitively (lowercase title)', () => {
    const res = screenListing({ title: 'senior backend engineer', snippet: 'hiring' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });

  it('rejects when snippet contains "3+ years"', () => {
    const res = screenListing({ title: 'Backend Engineer', snippet: '3+ years of experience required' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });

  it('rejects when snippet contains "5+ years"', () => {
    const res = screenListing({ title: 'Backend Engineer', snippet: '5+ years experience' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });

  it('rejects when snippet contains "minimum 3 years"', () => {
    const res = screenListing({ title: 'Backend Engineer', snippet: 'minimum 3 years experience' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });

  it('rejects when snippet contains "minimum 5 years"', () => {
    const res = screenListing({ title: 'Backend Engineer', snippet: 'minimum 5 years of experience' });
    expect(res.reject).toEqual({ reason: 'senior_role' });
  });
});

// ---------------------------------------------------------------------------
// Borderline titles — deliberately NOT rejected (D-04 second sentence)
// ---------------------------------------------------------------------------

describe('screenListing borderline titles proceed to audit', () => {
  it('does not reject "Leadership Program" (boundary-aware, "Lead" inside word)', () => {
    const res = screenListing({ title: 'Leadership Program', snippet: 'leadership development' });
    expect(res.reject).toBeNull();
  });

  it('does not reject "Managerial Assistant" (boundary-aware)', () => {
    const res = screenListing({ title: 'Managerial Assistant', snippet: 'assist managers' });
    expect(res.reject).toBeNull();
  });

  it('does not reject "Backend Engineer II"', () => {
    const res = screenListing({ title: 'Backend Engineer II', snippet: 'mid level role' });
    expect(res.reject).toBeNull();
  });

  it('does not reject "SDE-2"', () => {
    const res = screenListing({ title: 'SDE-2', snippet: 'software development engineer' });
    expect(res.reject).toBeNull();
  });

  it('does not reject "Engineer, 0–3 yrs"', () => {
    const res = screenListing({ title: 'Engineer, 0–3 yrs', snippet: '0 to 3 years experience' });
    expect(res.reject).toBeNull();
  });

  it('does not reject snippet "0–3 years"', () => {
    const res = screenListing({ title: 'Software Engineer', snippet: '0–3 years experience' });
    expect(res.reject).toBeNull();
  });

  it('does not reject snippet "up to 2 years"', () => {
    const res = screenListing({ title: 'Software Engineer', snippet: 'up to 2 years experience' });
    expect(res.reject).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Flags (never a reject) — D-07 scam + D-08 geo pre-detectors
// ---------------------------------------------------------------------------

describe('screenListing flag-only pre-detectors', () => {
  it('flags training/certification fee phrase', () => {
    const res = screenListing({ title: 'Junior Developer', snippet: 'pay training fee to join' });
    expect(res.reject).toBeNull();
    expect(res.flags).toContain('scam_training_fee');
  });

  it('flags registration/deposit charge phrase', () => {
    const res = screenListing({ title: 'Junior Developer', snippet: 'registration deposit required' });
    expect(res.reject).toBeNull();
    expect(res.flags).toContain('scam_registration_deposit');
  });

  it('flags pay-to-join phrase', () => {
    const res = screenListing({ title: 'Junior Developer', snippet: 'pay to join the program' });
    expect(res.reject).toBeNull();
    expect(res.flags).toContain('scam_pay_to_join');
  });

  it('flags Telegram/WhatsApp-only application phrase', () => {
    const res = screenListing({ title: 'Junior Developer', snippet: 'apply via telegram only' });
    expect(res.reject).toBeNull();
    expect(res.flags).toContain('scam_chat_only');
  });

  it('flags missing company identity heuristic', () => {
    const res = screenListing({ title: 'Junior Developer', snippet: 'no company name, work from home earn' });
    expect(res.reject).toBeNull();
    expect(res.flags.some((f) => f.startsWith('scam_'))).toBe(true);
  });

  it('flags earn ₹X/day pattern', () => {
    const res = screenListing({ title: 'Junior Developer', snippet: 'earn ₹500 per day from home' });
    expect(res.reject).toBeNull();
    expect(res.flags).toContain('scam_earn_per_day');
  });

  it('flags US-only geo phrase', () => {
    const res = screenListing({ title: 'Software Engineer', snippet: 'US only, based in New York' });
    expect(res.reject).toBeNull();
    expect(res.flags).toContain('geo_us_only');
  });

  it('flags EMEA-only geo phrase', () => {
    const res = screenListing({ title: 'Software Engineer', snippet: 'EMEA candidates only' });
    expect(res.reject).toBeNull();
    expect(res.flags).toContain('geo_emea_only');
  });

  it('flags work-authorization-required phrase', () => {
    const res = screenListing({ title: 'Software Engineer', snippet: 'must be authorized to work in the US' });
    expect(res.reject).toBeNull();
    expect(res.flags).toContain('work_auth_required');
  });

  it('never rejects on flag-only listings', () => {
    const res = screenListing({ title: 'Junior Developer', snippet: 'pay training fee to join, US only' });
    expect(res.reject).toBeNull();
    expect(res.flags.length).toBeGreaterThan(0);
  });

  it('protective phrasing "no fees" is never a reject', () => {
    const res = screenListing({ title: 'Junior Developer', snippet: 'no fees required, we never charge for training' });
    expect(res.reject).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Flag class name vocabulary exports
// ---------------------------------------------------------------------------

describe('SCAM_FLAG_CLASSES and GEO_FLAG_CLASSES exports', () => {
  it('SCAM_FLAG_CLASSES lists all scam flag classes', () => {
    expect(SCAM_FLAG_CLASSES).toContain('scam_training_fee');
    expect(SCAM_FLAG_CLASSES).toContain('scam_registration_deposit');
    expect(SCAM_FLAG_CLASSES).toContain('scam_pay_to_join');
    expect(SCAM_FLAG_CLASSES).toContain('scam_chat_only');
    expect(SCAM_FLAG_CLASSES).toContain('scam_missing_identity');
    expect(SCAM_FLAG_CLASSES).toContain('scam_earn_per_day');
    expect(SCAM_FLAG_CLASSES.length).toBe(6);
  });

  it('GEO_FLAG_CLASSES lists all geo flag classes', () => {
    expect(GEO_FLAG_CLASSES).toContain('geo_us_only');
    expect(GEO_FLAG_CLASSES).toContain('geo_emea_only');
    expect(GEO_FLAG_CLASSES).toContain('work_auth_required');
    expect(GEO_FLAG_CLASSES.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('screenListing edge cases', () => {
  it('empty title/snippet → reject null, flags []', () => {
    const res = screenListing({ title: '', snippet: '' });
    expect(res.reject).toBeNull();
    expect(res.flags).toEqual([]);
  });

  it('whitespace-only title → reject null, flags []', () => {
    const res = screenListing({ title: '   ', snippet: '' });
    expect(res.reject).toBeNull();
    expect(res.flags).toEqual([]);
  });

  it('clean junior listing → reject null, flags []', () => {
    const res = screenListing({ title: 'Junior Frontend Engineer', snippet: '0-1 years experience, Bangalore, India' });
    expect(res.reject).toBeNull();
    expect(res.flags).toEqual([]);
  });
});
