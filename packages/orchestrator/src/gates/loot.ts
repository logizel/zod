// Deterministic loot gates — the final authority over loot admit/reject.
// Mirrors passesPrizeGate (packages/discord-router/src/prize-gate.ts): pure,
// unit-testable, no I/O.
//
// LOT-04: US/EU-only shipping hard-rejects (loot_us_eu_only).
// LOT-04: unknown/unverified shipping rejects (loot_shipping_unverified).
// LOT-03: empty steps or empty step quote rejects (loot_claim_steps_unreadable).
// LOT-03: offer_cost not 'free' rejects (loot_not_fully_free) — the 100%-free
// qualifier: discounted, paid, and cost-unverifiable offers never admit.
// Admit returns bucket '#🎁-free-swag-and-credits' plus the D-14 loot fields.

export const BUCKET_LOOT = '#🎁-free-swag-and-credits';

export interface LootGateResult {
  admitted: boolean;
  reasonCode?: string;
  bucketChannel?: string;
}

export interface LootVerdictInput {
  shipping_verified: boolean;
  shipping_region: 'india' | 'worldwide' | 'us' | 'eu' | 'unknown';
  shipping_quote: string;
  card_required: boolean | null;
  offer_cost: 'free' | 'requires_payment' | 'unknown';
  claim_steps: Array<{ step: string; quote: string }>;
}

/**
 * evaluateLootGates: pure predicate over a parsed loot verdict.
 * Fail-closed order: US/EU → unverified shipping → unreadable claim steps →
 * non-free cost → admit with bucket.
 */
export function evaluateLootGates(verdict: LootVerdictInput): LootGateResult {
  // 1. LOT-04: US/EU-only shipping hard-reject.
  if (verdict.shipping_region === 'us' || verdict.shipping_region === 'eu') {
    return { admitted: false, reasonCode: 'loot_us_eu_only' };
  }

  // 2. LOT-04: unverified / unknown / quote-missing shipping → never admit.
  if (
    !verdict.shipping_verified ||
    verdict.shipping_region === 'unknown' ||
    !verdict.shipping_quote
  ) {
    return { admitted: false, reasonCode: 'loot_shipping_unverified' };
  }

  // 3. LOT-03: claim steps must be present and every step must carry a quote.
  if (
    !verdict.claim_steps ||
    verdict.claim_steps.length === 0 ||
    verdict.claim_steps.some((step) => !step.quote)
  ) {
    return { admitted: false, reasonCode: 'loot_claim_steps_unreadable' };
  }

  // 4. LOT-03: 100%-free qualifier — requires_payment or unknown never admit.
  if (verdict.offer_cost !== 'free') {
    return { admitted: false, reasonCode: 'loot_not_fully_free' };
  }

  // All gates pass — admit with the loot bucket.
  return {
    admitted: true,
    bucketChannel: BUCKET_LOOT,
  };
}

/**
 * evaluateLootGates final authority over a parsed loot verdict.
 * Returns { admitted, reasonCode, bucketChannel }.
 * Gate rejects win with enumerated reason codes; parse failures are handled
 * by the caller (parseLootVerdict returns null).
 */
