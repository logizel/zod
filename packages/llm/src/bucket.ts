// 2D per-(provider × model) bucket registry with cooldown + daily-cap bulkheads.
// D-02: vendor SDK error-type detection drives bucket transitions.
// D-23: all bucket timer state is time-driven; no setInterval in this package.

export enum BucketState {
  READY = 'READY',
  ACTIVE = 'ACTIVE',
  COOLDOWN = '60s-COOLDOWN',
  DAILY_CAP = 'DAILY-CAP',
}

export interface BucketEntry {
  provider: string;
  model: string;
  state: BucketState;
  cooldownUntil: number; // epoch ms, 0 when not cooling down
  dailyCapRemaining: number;
}

export interface BucketDef {
  provider: string;
  model: string;
}

/**
 * Per-(provider, model) bucket with independent cooldown + daily-cap counters.
 * Bucket state transitions are persisted to agent_telemetry by the router
 * via writeBucketState(); this registry holds the in-memory working state.
 */
export class BucketRegistry {
  private buckets = new Map<string, BucketEntry>();

  constructor(entries: readonly BucketDef[]) {
    for (const e of entries) {
      this.buckets.set(`${e.provider}:${e.model}`, {
        provider: e.provider,
        model: e.model,
        state: BucketState.READY,
        cooldownUntil: 0,
        dailyCapRemaining: 1000,
      });
    }
  }

  /** True when the bucket can accept a new request right now. */
  canFire(provider: string, model: string): boolean {
    const b = this.buckets.get(`${provider}:${model}`);
    if (!b) return false;

    // DAILY-CAP is terminal until UTC-day reset (handled externally).
    if (b.state === BucketState.DAILY_CAP) return false;

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

  /** Ladder order: all buckets in registration order. */
  getLadder(): BucketDef[] {
    return Array.from(this.buckets.values()).map((b) => ({
      provider: b.provider,
      model: b.model,
    }));
  }

  /** First bucket that can fire, in ladder order. Null when none available. */
  findNextAvailable(): BucketDef | null {
    for (const b of this.buckets.values()) {
      if (this.canFire(b.provider, b.model)) {
        return { provider: b.provider, model: b.model };
      }
    }
    return null;
  }

  /** Snapshot of all bucket states (for telemetry/audit). */
  getStates(): BucketEntry[] {
    return Array.from(this.buckets.values());
  }
}
