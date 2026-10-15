import { describe, expect, it } from 'vitest';
import { isSpam } from './spam.js';

describe('scout spam', () => {
  it('crypto airdrop returns true', () => {
    expect(isSpam('Crypto Airdrop 2x returns', '')).toBe(true);
  });
  it('betting casino odds returns true', () => {
    expect(isSpam('Betting casino odds', '')).toBe(true);
  });
  it('work from home earn returns true', () => {
    expect(isSpam('Work from home earn ₹50000', '')).toBe(true);
  });
  it('Hackathon 2026 returns false', () => {
    expect(isSpam('Hackathon 2026', '')).toBe(false);
  });
  it('System design workshop returns false', () => {
    expect(isSpam('System design workshop', '')).toBe(false);
  });
  it('blockchain workshop returns false', () => {
    expect(isSpam('blockchain workshop', '')).toBe(false);
  });
  it('case-insensitive', () => {
    expect(isSpam('CRYPTO AIRDROP', 'DOUBLE YOUR money')).toBe(true);
  });
});

import { describe as d2, expect as e2, it as i2 } from 'vitest';
import { prefilter } from './index.js';
d2('prefilter', () => {
  i2('expired reject', () => {
    const r = prefilter({ title: 'Old Event', snippet: 'Happened on 01 Jan 2020' });
    e2(r.verdict).toBe('reject');
    if (r.verdict === 'reject') e2(r.reason).toBe('expired');
  });
  i2('spam reject', () => {
    const r = prefilter({ title: 'Crypto airdrop giveaway', snippet: 'double your money' });
    e2(r.verdict).toBe('reject');
    if (r.verdict === 'reject') e2(r.reason).toBe('spam');
  });
  i2('valid pass', () => {
    const r = prefilter({ title: 'Example Hackathon 2026', snippet: 'Join us on 15 Nov 2026' });
    e2(r.verdict).toBe('pass');
  });
});
