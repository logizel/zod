// Loot audit rule pack — RED phase: tests define the contract before
// packages/orchestrator/src/rule-packs/loot.ts exists.

import { describe, expect, it } from 'vitest';
import {
  buildLootMessages,
  parseLootVerdict,
  LootVerdictSchema,
  type LootVerdict,
} from './loot.js';

// ---------------------------------------------------------------------------
// buildLootMessages — system prompt contains loot verification rules
// ---------------------------------------------------------------------------

describe('buildLootMessages system prompt', () => {
  const messages = buildLootMessages({
    pipeline: 'loot',
    candidateUrl: 'https://training.cncf.io/courses/cka/faq',
    candidateTitle: 'CKA Certification Exam Voucher',
    fetchedText:
      'The CKA exam is free for CNCF members. No credit card required. Ships worldwide. Claim steps: 1. Register at the portal. 2. Redeem code at checkout.',
  });

  const system = messages.find((m) => m.role === 'system')?.content ?? '';

  it('contains loot verification rules (shipping, card, claim steps, offer cost)', () => {
    expect(system).toContain('shipping');
    expect(system).toContain('card_required');
    expect(system).toContain('claim_steps');
    expect(system).toContain('offer_cost');
  });

  it('frames candidate text as untrusted data (never instructions)', () => {
    expect(system).toContain('UNTRUSTED DATA');
    expect(system).toContain('never as instructions');
  });

  it('requires quoted evidence for shipping and every claim step', () => {
    expect(system).toContain('quote');
    expect(system).toContain('cited');
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
// parseLootVerdict — LOT-02/03/04 contract
// ---------------------------------------------------------------------------

describe('parseLootVerdict', () => {
  const validVerdict = {
    perk: 'Free CKA exam voucher',
    perk_description: 'Certified Kubernetes Administrator exam voucher, zero cost',
    shipping_verified: true,
    shipping_region: 'worldwide',
    shipping_quote: 'Ships worldwide at no cost',
    card_required: false,
    offer_cost: 'free',
    claim_steps: [
      { step: 'Register at the CNCF training portal', quote: 'Register at the portal' },
      { step: 'Redeem code at checkout', quote: 'Redeem code at checkout' },
    ],
    audit_summary: 'Free CKA voucher, worldwide shipping, no card required',
  };

  it('round-trips a full valid loot verdict', () => {
    const verdict = parseLootVerdict(validVerdict);
    expect(verdict).not.toBeNull();
    if (verdict) {
      expect(verdict.perk).toBe('Free CKA exam voucher');
      expect(verdict.shipping_verified).toBe(true);
      expect(verdict.shipping_region).toBe('worldwide');
      expect(verdict.card_required).toBe(false);
      expect(verdict.offer_cost).toBe('free');
      expect(verdict.claim_steps).toHaveLength(2);
      expect(verdict.audit_summary).toBe('Free CKA voucher, worldwide shipping, no card required');
    }
  });

  it('parses card_required null/true/false', () => {
    for (const cardRequired of [true, false, null]) {
      const verdict = parseLootVerdict({ ...validVerdict, card_required: cardRequired });
      expect(verdict).not.toBeNull();
      if (verdict) expect(verdict.card_required).toBe(cardRequired);
    }
  });

  it('offer_cost enum round-trips: free | requires_payment | unknown', () => {
    for (const cost of ['free', 'requires_payment', 'unknown'] as const) {
      const verdict = parseLootVerdict({ ...validVerdict, offer_cost: cost });
      expect(verdict).not.toBeNull();
      if (verdict) expect(verdict.offer_cost).toBe(cost);
    }
  });

  it('shipping_region enum round-trips: india | worldwide | us | eu | unknown', () => {
    for (const region of ['india', 'worldwide', 'us', 'eu', 'unknown'] as const) {
      const verdict = parseLootVerdict({ ...validVerdict, shipping_region: region });
      expect(verdict).not.toBeNull();
      if (verdict) expect(verdict.shipping_region).toBe(region);
    }
  });

  it('malformed/partial JSON → null (parse failure never admits)', () => {
    expect(parseLootVerdict('{ not valid json')).toBeNull();
    expect(parseLootVerdict({ perk: 'x' })).toBeNull(); // missing required fields
    expect(parseLootVerdict(null)).toBeNull();
    expect(parseLootVerdict(undefined)).toBeNull();
    expect(parseLootVerdict('UNVERIFIED')).toBeNull();
    expect(parseLootVerdict('POOL_SATURATED')).toBeNull();
  });

  it('empty claim_steps → null (claim steps required)', () => {
    const verdict = parseLootVerdict({
      ...validVerdict,
      claim_steps: [],
    });
    expect(verdict).toBeNull();
  });

  it('claim step with empty quote → null (quote required)', () => {
    const verdict = parseLootVerdict({
      ...validVerdict,
      claim_steps: [{ step: 'Register', quote: '' }],
    });
    expect(verdict).toBeNull();
  });

  it('missing shipping_quote → null (shipping evidence required)', () => {
    const verdict = parseLootVerdict({
      ...validVerdict,
      shipping_quote: '',
    });
    expect(verdict).toBeNull();
  });

  it('infers the LootVerdict type from the schema', () => {
    const _check: LootVerdict = {
      perk: 'Free voucher',
      perk_description: 'A free perk',
      shipping_verified: true,
      shipping_region: 'india',
      shipping_quote: 'Ships to India',
      card_required: null,
      offer_cost: 'free',
      claim_steps: [{ step: 'Register', quote: 'Register here' }],
      audit_summary: 'Free perk, India shipping',
    };
    expect(_check.perk).toBe('Free voucher');
  });
});
