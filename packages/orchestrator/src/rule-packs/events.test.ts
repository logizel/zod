// Events audit rule pack — RED phase: tests define the contract before
// packages/orchestrator/src/rule-packs/events.ts exists.

import { describe, expect, it } from 'vitest';
import {
  buildEventsMessages,
  parseEventsVerdict,
  EventsVerdictSchema,
  type EventsVerdict,
} from './events.js';

// ---------------------------------------------------------------------------
// buildEventsMessages — system prompt contains event audit rules
// ---------------------------------------------------------------------------

describe('buildEventsMessages system prompt', () => {
  const messages = buildEventsMessages({
    pipeline: 'events',
    candidateUrl: 'https://devpost.com/event/hackathon-2026',
    candidateTitle: 'National CTF 2026',
    fetchedText:
      'A 48-hour cybersecurity CTF with ₹1,50,000 cash prize. Organized by CyberSec India. Agenda: workshops, CTF, awards.',
  });

  const system = messages.find((m) => m.role === 'system')?.content ?? '';

  it('contains event classification and organizer/agenda scoring', () => {
    expect(system).toContain('organizer');
    expect(system).toContain('agenda');
    expect(system).toContain('score');
  });

  it('contains prize extraction with cash-vs-credit separation (₹1L rule)', () => {
    expect(system).toContain('prize');
    expect(system).toContain('1,00,000');
    expect(system).toContain('credit');
  });

  it('contains perk detection for prize-gate failures', () => {
    expect(system).toContain('perk');
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
// parseEventsVerdict — full verdict contract
// ---------------------------------------------------------------------------

describe('parseEventsVerdict', () => {
  const validVerdict = {
    title: 'National CTF 2026',
    organizer: 'CyberSec India',
    category: 'sys-cp-sec',
    prize_cash_inr: 150000,
    prize_text: '₹1,50,000 cash',
    organizer_score: 9,
    agenda_score: 9,
    dates: { start: '2026-12-15T09:00:00Z', end: '2026-12-16T18:00:00Z' },
    audit_summary: 'Verified CTF event, ₹1.5L cash prize, India-organized',
    perk_hint: null,
  };

  it('round-trips a full valid events verdict', () => {
    const verdict = parseEventsVerdict(validVerdict);
    expect(verdict).not.toBeNull();
    if (verdict) {
      expect(verdict.title).toBe('National CTF 2026');
      expect(verdict.organizer).toBe('CyberSec India');
      expect(verdict.category).toBe('sys-cp-sec');
      expect(verdict.prize_cash_inr).toBe(150000);
      expect(verdict.perk_hint).toBeNull();
    }
  });

  it('parses prize_cash_inr null with prize_text (TBA/unverified)', () => {
    const verdict = parseEventsVerdict({ ...validVerdict, prize_cash_inr: null });
    expect(verdict).not.toBeNull();
    if (verdict) expect(verdict.prize_cash_inr).toBeNull();
  });

  it('category enum round-trips: sys-cp-sec | general', () => {
    for (const category of ['sys-cp-sec', 'general'] as const) {
      const verdict = parseEventsVerdict({ ...validVerdict, category });
      expect(verdict).not.toBeNull();
      if (verdict) expect(verdict.category).toBe(category);
    }
  });

  it('perk_hint string or null', () => {
    for (const hint of ['free swag drop', null]) {
      const verdict = parseEventsVerdict({ ...validVerdict, perk_hint: hint });
      expect(verdict).not.toBeNull();
      if (verdict) expect(verdict.perk_hint).toBe(hint);
    }
  });

  it('dates nullable object round-trips', () => {
    const verdict = parseEventsVerdict({ ...validVerdict, dates: null });
    expect(verdict).not.toBeNull();
    if (verdict) expect(verdict.dates).toBeNull();
  });

  it('malformed/partial JSON → null (parse failure never admits)', () => {
    expect(parseEventsVerdict('{ not valid json')).toBeNull();
    expect(parseEventsVerdict({ title: 'x' })).toBeNull(); // missing required fields
    expect(parseEventsVerdict(null)).toBeNull();
    expect(parseEventsVerdict(undefined)).toBeNull();
    expect(parseEventsVerdict('UNVERIFIED')).toBeNull();
    expect(parseEventsVerdict('POOL_SATURATED')).toBeNull();
  });

  it('infers the EventsVerdict type from the schema', () => {
    const _check: EventsVerdict = {
      title: 'Hackathon',
      organizer: 'Org',
      category: 'general',
      prize_cash_inr: null,
      prize_text: 'TBA',
      organizer_score: 5,
      agenda_score: 5,
      dates: null,
      audit_summary: 'Online event',
      perk_hint: 'free swag',
    };
    expect(_check.title).toBe('Hackathon');
  });
});
