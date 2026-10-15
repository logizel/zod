import { describe, it, expect } from 'vitest';
import { prefilter } from './domain-filter.js';

describe('domain-filter prefilter (80/20)', () => {
  it('admits SWE domains outright', () => {
    const r = prefilter({ title: 'Hackathon on github.com', snippet: 'build in public' });
    expect(r.verdict).toBe('pass');
  });

  it('admits deep-tech at organizer>=9 AND agenda>=9', () => {
    const r = prefilter(
      { title: 'Systems conference', snippet: 'deep-tech infra talk' },
      { organizerScore: 9, agendaScore: 9 },
    );
    expect(r.verdict).toBe('pass');
  });

  it('rejects deep-tech when organizer<9 OR agenda<9 (threshold boundary)', () => {
    const r1 = prefilter(
      { title: 'Systems conference', snippet: 'deep-tech infra talk' },
      { organizerScore: 8, agendaScore: 9 },
    ) as { verdict: 'reject'; reason: 'deep-tech-low-score'; detail: string };
    expect(r1.verdict).toBe('reject');
    expect(r1.reason).toBe('deep-tech-low-score');

    const r2 = prefilter(
      { title: 'Systems conference', snippet: 'deep-tech infra talk' },
      { organizerScore: 9, agendaScore: 8 },
    ) as { verdict: 'reject'; reason: 'deep-tech-low-score'; detail: string };
    expect(r2.verdict).toBe('reject');
    expect(r2.reason).toBe('deep-tech-low-score');
  });

  it('rejects non-technical business domains', () => {
    const r = prefilter(
      { title: 'Real estate networking mixer', snippet: 'commercial property seminar' },
      { organizerScore: 5, agendaScore: 5 },
    ) as { verdict: 'reject'; reason: 'non-technical'; detail: string };
    expect(r.verdict).toBe('reject');
    expect(r.reason).toBe('non-technical');
  });

  it('rejects with detail showing scores', () => {
    const r = prefilter({ title: 'Biz event', snippet: 'networking' }, { organizerScore: 3, agendaScore: 4 }) as { verdict: 'reject'; reason: string; detail: string };
    expect(r.detail).toContain('organizer=3');
    expect(r.detail).toContain('agenda=4');
  });
});
