// Loot deterministic gates — RED phase: tests define the contract before
// packages/orchestrator/src/gates/loot.ts exists.
// Mirrors prize-gate purity: pure predicates, no I/O, unit-testable.

import { describe, expect, it } from 'vitest';
import { evaluateLootGates, BUCKET_LOOT, type LootGateResult } from './loot.js';

const baseVerdict: any = {
  perk: 'Free CKA voucher',
  perk_description: 'Certified Kubernetes Administrator exam voucher',
  shipping_verified: true,
  shipping_region: 'india',
  shipping_quote: 'Ships to India at no cost',
  card_required: false,
  offer_cost: 'free',
  claim_steps: [
    { step: 'Register at the portal', quote: 'Register at the portal' },
    { step: 'Redeem code at checkout', quote: 'Redeem code at checkout' },
  ],
  audit_summary: 'Free voucher, India shipping, no card',
};

// ---------------------------------------------------------------------------
// Admit path
// ---------------------------------------------------------------------------

describe('evaluateLootGates admit', () => {
  it('admits india/worldwide + free + quoted steps → bucket #🎁-free-swag-and-credits', () => {
    for (const region of ['india', 'worldwide']) {
      const result = evaluateLootGates({ ...baseVerdict, shipping_region: region }) as LootGateResult;
      expect(result.admitted).toBe(true);
      expect(result.bucketChannel).toBe(BUCKET_LOOT);
      expect(result.reasonCode).toBeUndefined();
    }
  });

  it('BUCKET_LOOT is the free-swag bucket constant', () => {
    expect(BUCKET_LOOT).toBe('#🎁-free-swag-and-credits');
  });
});

// ---------------------------------------------------------------------------
// LOT-04: US/EU-only shipping hard-reject → loot_us_eu_only
// ---------------------------------------------------------------------------

describe('evaluateLootGates US/EU-only (loot_us_eu_only)', () => {
  it.each(['us', 'eu'])('rejects shipping_region=%s → loot_us_eu_only', (region) => {
    const result = evaluateLootGates({ ...baseVerdict, shipping_region: region }) as LootGateResult;
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('loot_us_eu_only');
  });
});

// ---------------------------------------------------------------------------
// LOT-04: unknown/unverified shipping → loot_shipping_unverified
// ---------------------------------------------------------------------------

describe('evaluateLootGates shipping unverified (loot_shipping_unverified)', () => {
  it('rejects shipping_verified=false → loot_shipping_unverified', () => {
    const result = evaluateLootGates({ ...baseVerdict, shipping_verified: false }) as LootGateResult;
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('loot_shipping_unverified');
  });

  it('rejects shipping_region=unknown → loot_shipping_unverified', () => {
    const result = evaluateLootGates({ ...baseVerdict, shipping_region: 'unknown' }) as LootGateResult;
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('loot_shipping_unverified');
  });

  it('rejects empty shipping_quote → loot_shipping_unverified', () => {
    const result = evaluateLootGates({ ...baseVerdict, shipping_quote: '' }) as LootGateResult;
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('loot_shipping_unverified');
  });
});

// ---------------------------------------------------------------------------
// LOT-03: claim steps unreadable → loot_claim_steps_unreadable
// ---------------------------------------------------------------------------

describe('evaluateLootGates claim steps (loot_claim_steps_unreadable)', () => {
  it('rejects empty claim_steps → loot_claim_steps_unreadable', () => {
    const result = evaluateLootGates({ ...baseVerdict, claim_steps: [] }) as LootGateResult;
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('loot_claim_steps_unreadable');
  });

  it('rejects a step with empty quote → loot_claim_steps_unreadable', () => {
    const result = evaluateLootGates({
      ...baseVerdict,
      claim_steps: [{ step: 'Register', quote: '' }],
    }) as LootGateResult;
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('loot_claim_steps_unreadable');
  });
});

// ---------------------------------------------------------------------------
// LOT-03: 100%-free qualifier → loot_not_fully_free
// ---------------------------------------------------------------------------

describe('evaluateLootGates offer cost (loot_not_fully_free)', () => {
  it.each(['requires_payment', 'unknown'])(
    'rejects offer_cost=%s → loot_not_fully_free',
    (cost) => {
      const result = evaluateLootGates({ ...baseVerdict, offer_cost: cost }) as LootGateResult;
      expect(result.admitted).toBe(false);
      expect(result.reasonCode).toBe('loot_not_fully_free');
    },
  );

  it('rejects discounted/paid/cost-unverifiable offers (never admits)', () => {
    const result = evaluateLootGates({ ...baseVerdict, offer_cost: 'requires_payment' }) as LootGateResult;
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('loot_not_fully_free');
  });
});

// ---------------------------------------------------------------------------
// Fail-closed ordering: shipping checked before claim steps before cost
// ---------------------------------------------------------------------------

describe('evaluateLootGates fail-closed ordering', () => {
  it('US/EU wins over cost when both fail', () => {
    const result = evaluateLootGates({
      ...baseVerdict,
      shipping_region: 'us',
      offer_cost: 'requires_payment',
    }) as LootGateResult;
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('loot_us_eu_only');
  });

  it('unverified shipping wins over cost when both fail', () => {
    const result = evaluateLootGates({
      ...baseVerdict,
      shipping_verified: false,
      offer_cost: 'requires_payment',
    }) as LootGateResult;
    expect(result.admitted).toBe(false);
    expect(result.reasonCode).toBe('loot_shipping_unverified');
  });
});
