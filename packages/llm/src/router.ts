// LlmRouter — end-to-end LLM gateway router for the 2D ladder.
// D-02: vendor SDK error-type detection drives baton-pass.
// D-03: centralized length-stitch via Stitcher.
// D-04: Cerebras omitted from bucket rotation.
// SWM-04: 429/413 baton-pass with zero re-scrape; step_1+step_2 re-issued to fallback.
// SWM-05: finish_reason:length stitched into one complete JSON verdict.
// SWM-06: Tier1 → Tier2 overflow (Tier2 only when ALL Tier1 buckets unavailable),
//         Cerebras absent, Curator > Auditor > Scout priority lanes,
//         daily-cap bulkheads, zero-cost spend circuit-breaker.

import { BucketRegistry, BucketState, type BucketDef } from './bucket.js';
import { Stitcher } from './stitch.js';
import { writeBucketState, type BucketStateInput } from './telemetry.js';
import type { ChatMessage, ChatResult, ChatOutcome } from './adapters/groq.js';
import { GroqAdapter } from './adapters/groq.js';
import { SambaNovaAdapter } from './adapters/sambanova.js';
import { MistralAdapter } from './adapters/mistral.js';
import { OpenRouterAdapter } from './adapters/openrouter.js';
import { ZaiAdapter } from './adapters/zimai.js';
import { NvidiaAdapter } from './adapters/nvidia.js';
import { LadderConfig, DEFAULT_LADDER, type LadderBucketDef } from './ladder.js';
import { PriorityQueue, type Priority } from './priority.js';
import { SpendCircuitBreaker } from './circuit-breaker.js';
import { env } from '@zod/config';
import { createLogger } from '@zod/logger';

const log = createLogger('info').child({ component: 'llm/router' });

export interface CompleteOptions {
  messages: ChatMessage[];
  step1: string;   // step_1 partial output (carried across baton-pass)
  step2: string;   // step_2 partial output (carried across baton-pass)
  slot: string;    // rolling agent slot id
  pipeline: string; // pipeline name (events | jobs | loot | local | social)
  url?: string;    // candidate URL (for telemetry row)
  priority?: Priority; // shared-pool priority lane (Curator 1 > Auditor 2 > Scout 3)
}

export interface CompleteResult {
  verdict: unknown;   // parsed JSON verdict, or 'UNVERIFIED' / 'POOL_SATURATED'
  bucket: string | null;     // which bucket produced the verdict ("tier/provider:model")
  path: string[];     // every bucket + tier attempted ("tier1/groq:openai/gpt-oss-120b")
  reason?: string;    // why no verdict was produced (exhaustion / pool saturation)
}

/** Structural sink for bucket telemetry writes (decouples router from PocketBase type). */
export interface TelemetrySink {
  writeBucketState: (input: BucketStateInput) => Promise<void>;
}

const UNVERIFIED = 'UNVERIFIED';
const POOL_SATURATED = 'POOL_SATURATED';

/**
 * LlmRouter.complete() — tries Tier1 buckets first (canFire only), falls through
 * to Tier2 only when ALL Tier1 buckets are unavailable (tier1Available() gate).
 * On 429/RateLimitError marks bucket cooldown, writes telemetry, hands step1+step2
 * to the next bucket (zero re-scrape). On finish_reason:length calls Stitcher.continue()
 * → one complete JSON verdict. Total exhaustion returns UNVERIFIED — never crashes,
 * never routes to Cerebras.
 */
export class LlmRouter {
  private registry: BucketRegistry;
  private ladder: LadderConfig;
  private adapters = new Map<string, { chat: (m: ChatMessage[]) => Promise<ChatOutcome> }>();
  private stitchers = new Map<string, Stitcher>();
  private telemetry: TelemetrySink | null;
  private queue: PriorityQueue;
  private breaker: SpendCircuitBreaker;

  constructor(
    telemetry: TelemetrySink | null = null,
    opts?: {
      ladder?: LadderConfig;
      queue?: PriorityQueue;
      breaker?: SpendCircuitBreaker;
    },
  ) {
    this.ladder = opts?.ladder ?? DEFAULT_LADDER;
    this.ladder.assertNoCerebras(); // D-04 enforcement: fail loud if Cerebras leaked in
    this.registry = new BucketRegistry(this.ladder.all);
    this.telemetry = telemetry;
    this.queue = opts?.queue ?? new PriorityQueue();
    this.breaker = opts?.breaker ?? new SpendCircuitBreaker({ paidOptIn: !!env.SAMBANOVA_API_KEY });
    this.buildAdapters();
  }

  private buildAdapters(): void {
    for (const def of this.ladder.all) {
      const key = `${def.provider}:${def.model}`;
      let adapter: { chat: (m: ChatMessage[]) => Promise<ChatOutcome> } | null = null;

      switch (def.provider) {
        case 'groq':
          adapter = new GroqAdapter(env.GROQ_API_KEY, def.model);
          break;
        case 'sambanova':
          // paid-opt-in: only wire up when the operator provided an API key.
          if (!env.SAMBANOVA_API_KEY) {
            log.debug({ provider: def.provider, model: def.model }, 'sambanova adapter skipped: no SAMBANOVA_API_KEY');
            continue;
          }
          adapter = new SambaNovaAdapter(env.SAMBANOVA_API_KEY, def.model);
          break;
        case 'mistral':
          // Tier-2 overflow: no provider key configured in this plan (zero-cost,
          // operator keys added separately); adapter wired but key-less.
          adapter = new MistralAdapter('', def.model);
          break;
        case 'openrouter':
          adapter = new OpenRouterAdapter('', def.model);
          break;
        case 'zai':
          adapter = new ZaiAdapter('', def.model);
          break;
        case 'nvidia':
          adapter = new NvidiaAdapter('', def.model);
          break;
        default:
          log.warn({ provider: def.provider }, 'LlmRouter: unknown provider, skipping');
          continue;
      }

      this.adapters.set(key, adapter);
      this.stitchers.set(key, new Stitcher(adapter));
    }
  }

  /**
   * Complete one audit through the ladder: Tier1 → Tier2.
   * step1 + step2 are re-issued to the fallback bucket on baton-pass — the
   * source URL is never re-fetched (SWM-04).
   */
  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    const { messages, step1, step2, slot, pipeline, url = '', priority } = opts;
    const path: string[] = [];

    // Shared-pool admission control: Curator(1) > Auditor(2) > Scout(3),
    // per-lane + global in-flight caps (T-03-08).
    let jobId: string | null = null;
    if (priority !== undefined) {
      jobId = this.queue.enqueue({ messages, step1, step2, slot, pipeline, url }, priority);
      if (jobId === null) {
        return { verdict: POOL_SATURATED, bucket: null, path, reason: 'shared-pool at in-flight cap' };
      }
    }

    try {
      // Build the full message set: caller messages + step1 + step2 context.
      const fullMessages: ChatMessage[] = [
        ...messages,
        { role: 'user', content: `step_1: ${step1}\nstep_2: ${step2}` },
      ];

      // Phase 1: Tier1 buckets (canFire only).
      let verdict: unknown = null;
      let usedBucket: string | null = null;

      for (const def of this.ladder.tier1) {
        const key = `${def.provider}:${def.model}`;
        path.push(`tier1/${key}`);

        if (!this.registry.canFire(def.provider, def.model)) continue;

        // Circuit-breaker: default-deny paid / zero-cost budget breach.
        const evalRes = this.breaker.evaluate({
          provider: def.provider,
          model: def.model,
          costTier: def.capability.costTier,
          projectedCost: 0,
        });
        if (evalRes.verdict === 'PARK') {
          log.debug({ provider: def.provider, model: def.model, reason: evalRes.reason }, 'bucket parked by circuit-breaker');
          continue;
        }

        const result = await this.attemptBucket(def, key, 'tier1', fullMessages, slot, pipeline, url);
        if (result.verdict !== null) {
          verdict = result.verdict;
          usedBucket = result.bucket;
          break;
        }
        // bucket failed (429/413/stitch-failure/exhausted) → try next tier1 bucket
      }

      // Phase 2: Tier2 overflow — only when Tier1 produced no verdict.
      if (verdict === null) {
        for (const def of this.ladder.tier2) {
          const key = `${def.provider}:${def.model}`;
          path.push(`tier2/${key}`);

          if (!this.registry.canFire(def.provider, def.model)) continue;

          const evalRes = this.breaker.evaluate({
            provider: def.provider,
            model: def.model,
            costTier: def.capability.costTier,
            projectedCost: 0,
          });
          if (evalRes.verdict === 'PARK') {
            log.debug({ provider: def.provider, model: def.model, reason: evalRes.reason }, 'bucket parked by circuit-breaker');
            continue;
          }

          const result = await this.attemptBucket(def, key, 'tier2', fullMessages, slot, pipeline, url);
          if (result.verdict !== null) {
            verdict = result.verdict;
            usedBucket = result.bucket;
            break;
          }
        }
      }

      // Total exhaustion — return UNVERIFIED with reason, never crash, never Cerebras.
      if (verdict === null) {
        return {
          verdict: UNVERIFIED,
          bucket: null,
          path,
          reason: 'all buckets exhausted (Tier1 + Tier2 unavailable)',
        };
      }

      return { verdict, bucket: usedBucket!, path };
    } finally {
      if (jobId !== null) this.queue.complete(jobId);
    }
  }

  /**
   * Attempt a single bucket: call adapter, interpret outcome, write telemetry.
   * Returns { verdict, bucket } when a verdict is produced, else { verdict: null }.
   */
  private async attemptBucket(
    def: LadderBucketDef,
    key: string,
    tier: 'tier1' | 'tier2',
    messages: ChatMessage[],
    slot: string,
    pipeline: string,
    url: string,
  ): Promise<{ verdict: unknown; bucket: string | null }> {
    const adapter = this.adapters.get(key);
    if (!adapter) {
      log.warn({ provider: def.provider, model: def.model }, 'bucket skipped: no adapter');
      return { verdict: null, bucket: null };
    }

    let outcome: ChatOutcome;
    try {
      outcome = await adapter.chat(messages);
    } catch (err) {
      log.error({ provider: def.provider, model: def.model, err }, 'adapter call threw');
      return { verdict: null, bucket: null };
    }

    const bucketPath = `${tier}/${key}`;

    // 429 / rate_limited → mark bucket cooldown, write telemetry, hand off to next bucket.
    if ('error' in outcome && outcome.error === 'rate_limited') {
      this.registry.markCooldown(def.provider, def.model, outcome.retryAfter ?? 60);
      await this.writeTelemetry(slot, def.provider, def.model, pipeline, url, 'cooldown', `bucket ${bucketPath} cooled down for ${outcome.retryAfter ?? 60}s`);
      log.warn({ provider: def.provider, model: def.model, retryAfter: outcome.retryAfter }, 'bucket rate-limited, handing off to next bucket');
      return { verdict: null, bucket: null };
    }

    // 413 / length_violation → treat as shrink-or-stitch signal, never blind-retry.
    if ('error' in outcome && outcome.error === 'length_violation') {
      log.warn({ provider: def.provider, model: def.model }, 'length violation, attempting stitch');
      const stitched = await this.tryStitch(def.provider, def.model, messages, slot, pipeline, url);
      if (stitched !== null) {
        this.registry.recordSuccess(def.provider, def.model);
        return { verdict: stitched, bucket: bucketPath };
      }
      return { verdict: null, bucket: null };
    }

    const result = outcome as ChatResult;
    this.registry.recordSuccess(def.provider, def.model);

    if (result.finishReason === 'length') {
      // Truncated mid-JSON — stitch via continuation prompt.
      const stitched = await this.tryStitch(
        def.provider,
        def.model,
        result.text ? [{ role: 'assistant', content: result.text }] : messages,
        slot,
        pipeline,
        url,
      );
      if (stitched !== null) {
        await this.writeTelemetry(slot, def.provider, def.model, pipeline, url, 'done', `stitch complete for ${bucketPath}`);
        return { verdict: stitched, bucket: bucketPath };
      }
      return { verdict: null, bucket: null };
    }

    // Normal completion — parse JSON verdict.
    try {
      const verdict = JSON.parse(result.text);
      await this.writeTelemetry(slot, def.provider, def.model, pipeline, url, 'done', `verdict from ${bucketPath}`);
      return { verdict, bucket: bucketPath };
    } catch {
      // Not valid JSON — try stitch to complete it.
      const stitched = await this.tryStitch(
        def.provider,
        def.model,
        result.text ? [{ role: 'assistant', content: result.text }] : messages,
        slot,
        pipeline,
        url,
      );
      if (stitched !== null) {
        await this.writeTelemetry(slot, def.provider, def.model, pipeline, url, 'done', `stitch-repaired verdict from ${bucketPath}`);
        return { verdict: stitched, bucket: bucketPath };
      }
      log.warn({ provider: def.provider, model: def.model }, 'non-JSON verdict, no stitcher or stitch failed');
      return { verdict: null, bucket: null };
    }
  }

  /** Issue the centralized length-stitch continuation; returns null on failure (caller falls back). */
  private async tryStitch(
    provider: string,
    model: string,
    messages: ChatMessage[],
    slot: string,
    pipeline: string,
    url: string,
  ): Promise<unknown | null> {
    const key = `${provider}:${model}`;
    const stitcher = this.stitchers.get(key);
    if (!stitcher) {
      log.error({ provider, model }, 'no stitcher for length violation');
      return null;
    }
    try {
      // Stitcher.continue expects the partial text; rebuild from message contents.
      const partial = messages.map((m) => m.content).join('\n');
      const verdict = await stitcher.stitchAndParse(partial);
      this.registry.recordSuccess(provider, model);
      await this.writeTelemetry(slot, provider, model, pipeline, url, 'done', `stitch complete for ${key}`);
      return verdict;
    } catch (err) {
      log.error({ provider, model, err }, 'stitch failed');
      return null;
    }
  }

  private async writeTelemetry(
    slot: string,
    provider: string,
    model: string,
    pipeline: string,
    url: string,
    status: 'active' | 'done' | 'cooldown' | 'error',
    detail: string,
  ): Promise<void> {
    if (!this.telemetry) return;
    try {
      await this.telemetry.writeBucketState({
        slot,
        provider,
        model,
        step: `${pipeline}-audit`,
        url,
        status,
        detail,
      });
    } catch (err) {
      log.error({ slot, provider, model, err }, 'failed to write bucket telemetry');
    }
  }

  /** Current bucket states (for operator visibility / debugging). */
  getBucketStates() {
    return this.registry.getStates();
  }

  /** Scheduler-invoked: recover a COOLDOWN bucket when its cooldownUntil has elapsed.
   * Flips COOLDOWN → READY via recordSuccess. Returns true if recovered, false otherwise.
   * Called by the gateway-bucket-cooldown cron job (single scheduler registry, D-23). */
  recoverBucket(provider: string, model: string): boolean {
    const entry = this.registry.getStates().find((b) => b.provider === provider && b.model === model);
    if (!entry || entry.state !== BucketState.COOLDOWN) return false;
    if (Date.now() < entry.cooldownUntil) return false;
    this.registry.recordSuccess(provider, model);
    return true;
  }

  /** Ladder config in use (for introspection / tests). */
  getLadderConfig(): LadderConfig {
    return this.ladder;
  }

  /** Circuit-breaker parked buckets (for operator visibility). */
  getParkedBuckets(): string[] {
    return this.breaker.parkedKeys();
  }

  /** Priority-queue stats (shared-pool visibility). */
  getQueueStats() {
    return this.queue.stats();
  }
}

/**
 * Standalone convenience: create a default router and complete one audit.
 * Telemetry is a no-op sink when no sink is provided.
 */
export async function complete(opts: CompleteOptions): Promise<CompleteResult> {
  const router = new LlmRouter();
  return router.complete(opts);
}
