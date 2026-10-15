import { describe, expect, it } from 'vitest';
import { prefilter, extractPastDate, isSpam } from './index.js';

describe('scout prefilter', () => {
  it('passes valid future-dated title', () => {
    expect(prefilter({ title: 'Example Hackathon 2026', snippet: 'Join us on 15 Nov 2026' })).toEqual({ verdict: 'pass' });
  });

  it('rejects expired past date', () => {
    const res = prefilter({ title: 'Old Event', snippet: 'Happened on 01 Jan 2020' });
    expect(res.verdict).toBe('reject');
    if (res.verdict === 'reject') expect(res.reason).toBe('expired');
  });

  it('rejects spam keywords', () => {
    const res = prefilter({ title: 'Crypto airdrop giveaway', snippet: 'double your money' });
    expect(res.verdict).toBe('reject');
    if (res.verdict === 'reject') expect(res.reason).toBe('spam');
  });

  it('extractPastDate returns null for no date', () => {
    expect(extractPastDate('no date here')).toBeNull();
  });

  it('isSpam detects blocked keyword', () => {
    expect(isSpam('Bet big', 'casino odds tonight')).toBe(true);
    expect(isSpam('Hackathon', 'build stuff')).toBe(false);
  });
});
