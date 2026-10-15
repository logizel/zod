// Spend circuit breaker — zero-cost enforcement for autonomous LLM traffic.
//
// evaluate(bucket, projectedCost) → PARK / ALLOW.
// - Default-deny paid traffic: paid-opt-in buckets require explicit operator opt-in.
// - Zero-cost budget: any projected cost > budget parks the bucket.
// - Auto-resume at UTC midnight (time-driven; never blocks the caller).
// - No setInterval.

export type BreakerVerdict = 'ALLOW' | 'PARK';

export interface BreakerEvaluation {
  verdict: BreakerVerdict;
  reason: string;
  /** Epoch ms when a parked bucket auto-resumes (next UTC midnight), or null. */
  parkedUntil: number | null;
}

export interface CircuitBreakerOptions {
  /** Zero-cost budget: max projected daily cost before parking (default 0 = zero-cost only). */
  zeroCostBudget?: number;
  /** Whether the operator has opted into paid traffic (SambaNova developer tier). */
  paidOptIn?: boolean;
}

/** Epoch ms of the next UTC midnight (auto-resume point for parked buckets). */
function nextUtcMidnight(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return midnight.getTime();
}

export interface BucketCost {
  provider: string;
  model: string;
  costTier: 'zero' | 'paid-opt-in';
  projectedCost: number;
}

/**
 * SpendCircuitBreaker guards autonomous LLM spend against the zero-cost constraint.
 * Buckets are parked (not blocked — the router falls back to the next bucket) and
 * auto-resume at UTC midnight.
 */
export class SpendCircuitBreaker {
  private readonly zeroCostBudget: number;
  private readonly paidOptIn: boolean;
  /** Bucket key (provider:model) → resume-at epoch ms. */
  private parked = new Map<string, number>();

  constructor(opts: CircuitBreakerOptions = {}) {
    this.zeroCostBudget = opts.zeroCostBudget ?? 0; // zero-cost by default
    this.paidOptIn = opts.paidOptIn ?? false;
  }

  /**
   * Evaluate whether a bucket may be used for the projected cost.
   * Parks the bucket until UTC midnight on any policy violation.
   */
  evaluate(bucket: BucketCost): BreakerEvaluation {
    const key = `${bucket.provider}:${bucket.model}`;
    const now = Date.now();

    // Auto-resume any parked bucket whose midnight has passed (time-driven recovery).
    const parkedUntil = this.parked.get(key);
    if (parkedUntil !== undefined && now >= parkedUntil) {
      this.parked.delete(key);
    }

    // Default-deny paid traffic without explicit operator opt-in (zero-cost constraint).
    if (bucket.costTier === 'paid-opt-in' && !this.paidOptIn) {
      this.park(key);
      return {
        verdict: 'PARK',
        reason: `paid-opt-in provider ${bucket.provider}:${bucket.model} requires explicit operator opt-in`,
        parkedUntil: this.parked.get(key) ?? null,
      };
    }

    // Zero-cost budget breach: any projected cost above budget parks the bucket.
    if (bucket.projectedCost > this.zeroCostBudget) {
      this.park(key);
      return {
        verdict: 'PARK',
        reason: `projected cost ${bucket.projectedCost} exceeds zero-cost budget ${this.zeroCostBudget}`,
        parkedUntil: this.parked.get(key) ?? null,
      };
    }

    return { verdict: 'ALLOW', reason: 'within zero-cost budget', parkedUntil: null };
  }

  /** True when the bucket is currently parked (until UTC midnight resume). */
  isParked(provider: string, model: string): boolean {
    const key = `${provider}:${model}`;
    const parkedUntil = this.parked.get(key);
    if (parkedUntil === undefined) return false;
    if (Date.now() >= parkedUntil) {
      this.parked.delete(key);
      return false;
    }
    return true;
  }

  /** Manually park a bucket (used on policy violations). Resumes at UTC midnight. */
  park(provider: string, model: string): void;
  park(key: string): void;
  park(a: string, b?: string): void {
    const key = b !== undefined ? `${a}:${b}` : a;
    this.parked.set(key, nextUtcMidnight());
  }

  /** All currently-parked bucket keys. */
  parkedKeys(): string[] {
    const now = Date.now();
    const result: string[] = [];
    for (const [key, until] of this.parked) {
      if (now < until) result.push(key);
    }
    return result;
  }
}
