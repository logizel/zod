import { describe, it, expect } from 'vitest';
import { passesPrizeGate } from './prize-gate.js';

describe('prize-gate (verified liquid cash >= ₹1L INR)', () => {
  it('passes explicit INR >= 100000', () => {
    expect(passesPrizeGate('₹1,00,000 cash prize', 100000)).toBe(true);
    expect(passesPrizeGate('₹2,50,000 cash', 250000)).toBe(true);
  });

  it('rejects prize_cash_inr null (TBA/unverified)', () => {
    expect(passesPrizeGate('₹5L prize', null)).toBe(false);
    expect(passesPrizeGate('TBA', null)).toBe(false);
  });

  it('rejects credit-inflated prizes (credits/vouchers/certificates)', () => {
    expect(passesPrizeGate('₹5L credits', 500000)).toBe(false);
    expect(passesPrizeGate('₹1L vouchers', 100000)).toBe(false);
    expect(passesPrizeGate('₹2L certificates', 200000)).toBe(false);
  });

  it('rejects TBA/unverified prize text', () => {
    expect(passesPrizeGate('TBA', 0)).toBe(false);
    expect(passesPrizeGate('Prize TBD', null)).toBe(false);
  });

  it('rejects below ₹1L even with explicit text', () => {
    expect(passesPrizeGate('₹50,000 cash', 50000)).toBe(false);
  });
});
