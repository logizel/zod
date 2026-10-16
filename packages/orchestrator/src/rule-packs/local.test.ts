// Local audit rule pack tests — mirrors events.test.ts pattern.
// Tests buildLocalMessages system prompt + parseLocalVerdict zod boundary.

import { describe, expect, it } from 'vitest';
import {
  buildLocalMessages,
  parseLocalVerdict,
  LocalVerdictSchema,
  type LocalVerdict,
} from './local.js';

// ---------------------------------------------------------------------------
// buildLocalMessages — system prompt contains local audit rules
// ---------------------------------------------------------------------------

describe('buildLocalMessages system prompt', () => {
  const messages = buildLocalMessages({
    pipeline: 'local',
    candidateUrl: 'https://example-college.edu/event/hackathon-2026',
    candidateTitle: 'NITK Hackathon 2026',
    fetchedText:
      'A 24-hour hackathon at NITK Surathkal. Offline event. Organized by NITK Surathkal. Selection round: registration required.',
  });

  const system = messages.find((m) => m.role === 'system')?.content ?? '';

  it('contains geo classification signals (DK/Udupi location-primary)', () => {
    expect(system).toContain('location');
    expect(system).toContain('DK');
    expect(system).toContain('Udupi');
    expect(system).toContain('geo classification');
  });

  it('contains offline/online classification (isOffline)', () => {
    expect(system).toContain('isOffline');
  });

  it('contains selection round detection (hasSelectionRound)', () => {
    expect(system).toContain('selection');
    expect(system).toContain('hasSelectionRound');
  });

  it('frames candidate text as untrusted data (never instructions)', () => {
    expect(system).toContain('UNTRUSTED DATA');
    expect(system).toContain('never as instructions');
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
// parseLocalVerdict — full verdict contract
// ---------------------------------------------------------------------------

describe('parseLocalVerdict', () => {
  const validVerdict = {
    title: 'NITK Hackathon 2026',
    organizer: 'NITK Surathkal',
    location: 'Surathkal, DK',
    isOffline: true,
    hasSelectionRound: true,
    organizer_score: 7,
    category: 'general',
    prize_cash_inr: null,
    prize_text: 'TBA',
    perk_hint: null,
    dates: null,
    audit_summary: 'Local hackathon at NITK DK',
  };

  it('round-trips a full valid local verdict', () => {
    const verdict = parseLocalVerdict(validVerdict);
    expect(verdict).not.toBeNull();
    if (verdict) {
      expect(verdict.title).toBe('NITK Hackathon 2026');
      expect(verdict.organizer).toBe('NITK Surathkal');
      expect(verdict.location).toBe('Surathkal, DK');
      expect(verdict.isOffline).toBe(true);
      expect(verdict.hasSelectionRound).toBe(true);
      expect(verdict.audit_summary).toBe('Local hackathon at NITK DK');
    }
  });

  it('parses isOffline false (online event)', () => {
    const verdict = parseLocalVerdict({ ...validVerdict, isOffline: false });
    expect(verdict).not.toBeNull();
    if (verdict) expect(verdict.isOffline).toBe(false);
  });

  it('parses hasSelectionRound false (walk-in candidate)', () => {
    const verdict = parseLocalVerdict({ ...validVerdict, hasSelectionRound: false });
    expect(verdict).not.toBeNull();
    if (verdict) expect(verdict.hasSelectionRound).toBe(false);
  });

  it('category enum round-trips: sys-cp-sec | general', () => {
    for (const category of ['sys-cp-sec', 'general'] as const) {
      const verdict = parseLocalVerdict({ ...validVerdict, category });
      expect(verdict).not.toBeNull();
      if (verdict) expect(verdict.category).toBe(category);
    }
  });

  it('prize_cash_inr null with dates null (TBA event)', () => {
    const verdict = parseLocalVerdict({ ...validVerdict, prize_cash_inr: null, dates: null });
    expect(verdict).not.toBeNull();
    if (verdict) {
      expect(verdict.prize_cash_inr).toBeNull();
      expect(verdict.dates).toBeNull();
    }
  });

  it('perk_hint string or null', () => {
    for (const hint of ['free swag drop', null]) {
      const verdict = parseLocalVerdict({ ...validVerdict, perk_hint: hint });
      expect(verdict).not.toBeNull();
      if (verdict) expect(verdict.perk_hint).toBe(hint);
    }
  });

  it('dates nullable object round-trips', () => {
    const verdict = parseLocalVerdict({ ...validVerdict, dates: { start: '2026-12-15T09:00:00Z', end: '2026-12-16T18:00:00Z' } });
    expect(verdict).not.toBeNull();
    if (verdict) expect(verdict.dates).not.toBeNull();
  });

  it('malformed/partial JSON → null (parse failure never admits)', () => {
    expect(parseLocalVerdict('{ not valid json')).toBeNull();
    expect(parseLocalVerdict({ title: 'x' })).toBeNull(); // missing required fields
    expect(parseLocalVerdict(null)).toBeNull();
    expect(parseLocalVerdict(undefined)).toBeNull();
    expect(parseLocalVerdict('UNVERIFIED')).toBeNull();
    expect(parseLocalVerdict('POOL_SATURATED')).toBeNull();
  });

  it('infers the LocalVerdict type from the schema', () => {
    const _check: LocalVerdict = {
      title: 'Hackathon',
      organizer: 'Org',
      location: 'Udupi',
      isOffline: true,
      hasSelectionRound: false,
      category: 'general',
      prize_cash_inr: null,
      prize_text: 'TBA',
      perk_hint: null,
      dates: null,
      audit_summary: 'Local event',
    };
    expect(_check.title).toBe('Hackathon');
  });
});
