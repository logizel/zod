// 2D per-(provider × model) bucket registry with cooldown + daily-cap bulkheads.
// D-02: vendor SDK error-type detection drives bucket transitions.
// D-23: all bucket timer state is time-driven; no setInterval in this package.

export enum BucketState {
  READY = 'READY',
  ACTIVE = 'ACTIVE',
  COOLDOWN = '60s-COOLDOWN',
  DAILY_CAP = 'DAILY-CAP',
}

export type LadderTier = 'tier1' | 'tier2';

export interface BucketEntry {
  provider: string;
  model: string;
  tier: LadderTier;
  state: BucketState;
  cooldownUntil: number; // epoch ms, 0 when not cooling down
  dailyCapRemaining: number; // requests remaining before daily cap
  dailyCapResetAt: number; // epoch ms of next UTC midnight (time-driven reset)
}

export interface BucketDef {
  provider: string;
  model: string;
  tier: LadderTier;
}

const DEFAULT_DAILY_CAP = 1000;

/** Epoch ms of the next UTC midnight (time-driven daily-cap reset). */
function nextUtcMidnight(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return midnight.getTime();
}

/**
 * Per-(provider, model) bucket with independent cooldown + daily-cap counters.
 * Bucket state transitions are persisted to agent_telemetry by the router
 * via writeBucketState(); this registry holds the in-memory working state.
 * All recovery is time-driven (never caller-blocked); no setInterval.
 */
export class BucketRegistry {
  private buckets = new Map<string, BucketEntry>();

  constructor(entries: readonly BucketDef[], dailyCap = DEFAULT_DAILY_CAP) {
    const resetAt = nextUtcMidnight();
    for (const e of entries) {
      this.buckets.set(`${e.provider}:${e.model}`, {
        provider: e.provider,
        model: e.model,
        tier: e.tier,
        state: BucketState.READY,
        cooldownUntil: 0,
        dailyCapRemaining: dailyCap,
        dailyCapResetAt: resetAt,
      });
    }
  }

  /** True when the bucket can accept a new request right now. Time-driven self-recovery. */
  canFire(provider: string, model: string): boolean {
    const b = this.buckets.get(`${provider}:${model}`);
    if (!b) return false;

    // Time-driven daily-cap reset at UTC midnight (never blocks the caller).
    if (Date.now() >= b.dailyCapResetAt) {
      b.dailyCapRemaining = DEFAULT_DAILY_CAP;
      b.dailyCapResetAt = nextUtcMidnight();
      if (b.state === BucketState.DAILY_CAP) {
        b.state = BucketState.READY;
      }
    }

    // DAILY-CAP is terminal until UTC-day reset (handled above).
    if (b.state === BucketState.DAILY_CAP) return false;
    if (b.dailyCapRemaining <= 0) {
      b.state = BucketState.DAILY_CAP;
      return false;
    }

    // COOLDOWN: check if the cool-down period has elapsed.
    if (b.state === BucketState.COOLDOWN) {
      if (Date.now() < b.cooldownUntil) return false;
      // Cool-down expired — self-recover to READY (time-driven, never caller-blocked).
      b.state = BucketState.READY;
      b.cooldownUntil = 0;
      return true;
    }

    return b.state === BucketState.READY;
  }

  /** True when the bucket is currently daily-capped. */
  isDailyCapped(provider: string, model: string): boolean {
    const b = this.buckets.get(`${provider}:${model}`);
    return b ? b.state === BucketState.DAILY_CAP : false;
  }

  /** True when the bucket's daily-cap remaining is exhausted. */
  dailyCapExhausted(provider: string, model: string): boolean {
    const b = this.buckets.get(`${provider}:${model}`);
    return b ? b.dailyCapRemaining <= 0 : true;
  }

  /** Consume one unit of daily-cap remaining. Marks DAILY-CAP when it hits zero. */
  consumeDailyCap(provider: string, model: string): void {
    const b = this.buckets.get(`${provider}:${model}`);
    if (!b) return;
    if (b.dailyCapRemaining > 0) b.dailyCapRemaining -= 1;
    if (b.dailyCapRemaining <= 0) {
      b.state = BucketState.DAILY_CAP;
      b.dailyCapRemaining = 0;
    }
  }

  /** Mark bucket as cooling down for `seconds` (or Retry-After value). */
  markCooldown(provider: string, model: string, seconds: number): void {
    const b = this.buckets.get(`${provider}:${model}`);
    if (!b) return;
    b.state = BucketState.COOLDOWN;
    b.cooldownUntil = Date.now() + seconds * 1000;
  }

  /** Mark bucket as daily-cap exhausted. */
  markDailyCap(provider: string, model: string): void {
    const b = this.buckets.get(`${provider}:${model}`);
    if (!b) return;
    b.state = BucketState.DAILY_CAP;
    b.dailyCapRemaining = 0;
  }

  /** Record a successful call — bucket returns to READY. */
  recordSuccess(provider: string, model: string): void {
    const b = this.buckets.get(`${provider}:${model}`);
    if (!b) return;
    b.state = BucketState.READY;
    b.cooldownUntil = 0;
  }

  /** True iff at least one Tier1 bucket can fire right now.
   *  Gate: Tier2 engages only when ALL Tier1 buckets are unavailable.
   *  (Semantics: any Tier1 READY/ACTIVE → true → use Tier1 only.) */
  allTier1Available(): boolean {
    for (const b of this.buckets.values()) {
      if (b.tier === 'tier1' && this.canFire(b.provider, b.model)) return true;
    }
    return false;
  }

  /** Tier1 bucket definitions, in ladder order. */
  getTier1(): BucketDef[] {
    return Array.from(this.buckets.values())
      .filter((b) => b.tier === 'tier1')
      .map((b) => ({ provider: b.provider, model: b.model, tier: b.tier }));
  }

  /** Tier2 bucket definitions, in ladder order. */
  getTier2(): BucketDef[] {
    return Array.from(this.buckets.values())
      .filter((b) => b.tier === 'tier2')
      .map((b) => ({ provider: b.provider, model: b.model, tier: b.tier }));
  }

  /** Ladder order: all buckets in registration order. */
  getLadder(): BucketDef[] {
    return Array.from(this.buckets.values()).map((b) => ({
      provider: b.provider,
      model: b.model,
      tier: b.tier,
    }));
  }

  /** First bucket that can fire, in ladder order. Null when none available. */
  findNextAvailable(): BucketDef | null {
    for (const b of this.buckets.values()) {
      if (this.canFire(b.provider, b.model)) {
        return { provider: b.provider, model: b.model, tier: b.tier };
      }
    }
    return null;
  }

  /** Snapshot of all bucket states (for telemetry/audit). */
  getStates(): BucketEntry[] {
    return Array.from(this.buckets.values());
  }
}
