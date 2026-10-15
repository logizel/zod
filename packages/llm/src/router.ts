// LlmRouter — end-to-end LLM gateway tracer for one audit.
// D-02: vendor SDK error-type detection drives baton-pass.
// D-03: centralized length-stitch via Stitcher.
// D-04: Cerebras omitted from bucket rotation.

import { BucketRegistry, BucketState, type BucketDef } from './bucket.js';
import { Stitcher } from './stitch.js';
import { writeBucketState, type BucketStateInput } from './telemetry.js';
import type { ChatMessage, ChatResult, ChatOutcome } from './adapters/groq.js';
import { GroqAdapter } from './adapters/groq.js';
import { GitHubModelsAdapter } from './adapters/github.js';
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
}

export interface CompleteResult {
  verdict: unknown;   // parsed JSON verdict
  bucket: string;     // which bucket produced the verdict ("provider/model")
  path: string[];     // every bucket attempted (audit trail)
}

/** Structural sink for bucket telemetry writes (decouples router from PocketBase type). */
export interface TelemetrySink {
  writeBucketState: (input: BucketStateInput) => Promise<void>;
}

const GROQ_MODEL = 'llama-3.1-8b-instant';
const GITHUB_MODEL = 'gpt-4.1-mini';

/**
 * Tracer ladder: Groq primary → GitHub Models fallback.
 * Cerebras is intentionally absent (D-04, SWM-06).
 */
const LADDER: BucketDef[] = [
  { provider: 'groq', model: GROQ_MODEL },
  { provider: 'github', model: GITHUB_MODEL },
];

/** Map bucket state to telemetry status. */
function stateToTelemetryStatus(state: BucketState): 'active' | 'done' | 'cooldown' | 'error' {
  switch (state) {
    case BucketState.READY:
    case BucketState.ACTIVE:
      return 'active';
    case BucketState.COOLDOWN:
      return 'cooldown';
    case BucketState.DAILY_CAP:
      return 'error';
  }
}

/**
 * LlmRouter.complete() — tries buckets in ladder order; on 429/RateLimitError
 * marks bucket 60s-COOLDOWN, writes telemetry, hands step1+step2 to next bucket
 * (zero re-scrape); on finish_reason:length calls Stitcher.continue() → one
 * complete JSON verdict.
 */
export class LlmRouter {
  private registry: BucketRegistry;
  private adapters = new Map<string, { chat: (m: ChatMessage[]) => Promise<ChatOutcome> }>();
  private telemetry: TelemetrySink | null;
  private stitchers = new Map<string, Stitcher>();

  constructor(
    telemetry: TelemetrySink | null = null,
    opts?: { ladder?: BucketDef[] },
  ) {
    this.registry = new BucketRegistry(opts?.ladder ?? LADDER);
    this.telemetry = telemetry;
    this.buildAdapters();
  }

  private buildAdapters(): void {
    for (const def of this.registry.getLadder()) {
      const key = `${def.provider}:${def.model}`;
      let adapter: { chat: (m: ChatMessage[]) => Promise<ChatOutcome> };

      switch (def.provider) {
        case 'groq': {
          const groq = new GroqAdapter(env.GROQ_API_KEY, def.model);
          adapter = groq;
          break;
        }
        case 'github': {
          const gh = new GitHubModelsAdapter(env.GITHUB_TOKEN, def.model);
          adapter = gh;
          break;
        }
        default:
          throw new Error(`LlmRouter: unknown provider '${def.provider}'`);
      }

      this.adapters.set(key, adapter);
      this.stitchers.set(key, new Stitcher(adapter));
    }
  }

  /**
   * Complete one audit through the bucket ladder.
   * step1 + step2 are re-issued to the fallback bucket on baton-pass — the
   * source URL is never re-fetched (SWM-04).
   */
  async complete(opts: CompleteOptions): Promise<CompleteResult> {
    const { messages, step1, step2, slot, pipeline, url = '' } = opts;
    const path: string[] = [];

    // Build the full message set: caller messages + step1 + step2 context.
    const fullMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: `step_1: ${step1}\nstep_2: ${step2}` },
    ];

    for (const def of this.registry.getLadder()) {
      const key = `${def.provider}:${def.model}`;
      path.push(key);

      if (!this.registry.canFire(def.provider, def.model)) {
        log.debug({ provider: def.provider, model: def.model }, 'bucket skipped: unavailable');
        continue;
      }

      const adapter = this.adapters.get(key);
      if (!adapter) {
        log.warn({ provider: def.provider, model: def.model }, 'bucket skipped: no adapter');
        continue;
      }

      let outcome: ChatOutcome;
      try {
        outcome = await adapter.chat(fullMessages);
      } catch (err) {
        log.error({ provider: def.provider, model: def.model, err }, 'adapter call threw');
        continue;
      }

      // 429 / rate_limited → mark bucket cooldown, write telemetry, hand off to next bucket.
      if ('error' in outcome && outcome.error === 'rate_limited') {
        this.registry.markCooldown(def.provider, def.model, outcome.retryAfter ?? 60);
        await this.writeTelemetry(slot, def.provider, def.model, pipeline, url, 'cooldown', `bucket ${key} cooled down for ${outcome.retryAfter ?? 60}s`);
        log.warn({ provider: def.provider, model: def.model, retryAfter: outcome.retryAfter }, 'bucket rate-limited, handing off to next bucket');
        continue;
      }

      // length_violation → 413, treat as shrink-or-stitch signal.
      if ('error' in outcome && outcome.error === 'length_violation') {
        log.warn({ provider: def.provider, model: def.model }, 'length violation, attempting stitch');
        const stitcher = this.stitchers.get(key);
        if (!stitcher) {
          log.error({ provider: def.provider, model: def.model }, 'no stitcher for length violation');
          continue;
        }
        try {
          const partial = fullMessages.map((m) => m.content).join('\n');
          const verdict = await stitcher.stitchAndParse(partial);
          this.registry.recordSuccess(def.provider, def.model);
          await this.writeTelemetry(slot, def.provider, def.model, pipeline, url, 'done', `stitch complete for ${key}`);
          return { verdict, bucket: key, path };
        } catch (err) {
          log.error({ provider: def.provider, model: def.model, err }, 'stitch failed');
          continue;
        }
      }

      // Successful result.
      const result = outcome as ChatResult;
      this.registry.recordSuccess(def.provider, def.model);

      if (result.finishReason === 'length') {
        // Truncated mid-JSON — stitch via continuation prompt.
        const stitcher = this.stitchers.get(key);
        if (!stitcher) {
          log.error({ provider: def.provider, model: def.model }, 'no stitcher for finish_reason:length');
          continue;
        }
        try {
          const verdict = await stitcher.stitchAndParse(result.text);
          await this.writeTelemetry(slot, def.provider, def.model, pipeline, url, 'done', `stitch complete for ${key}`);
          return { verdict, bucket: key, path };
        } catch (err) {
          log.error({ provider: def.provider, model: def.model, err }, 'stitch failed for truncated output');
          continue;
        }
      }

      // Normal completion — parse JSON verdict.
      try {
        const verdict = JSON.parse(result.text);
        await this.writeTelemetry(slot, def.provider, def.model, pipeline, url, 'done', `verdict from ${key}`);
        return { verdict, bucket: key, path };
      } catch {
        // Not valid JSON — try stitch to complete it.
        const stitcher = this.stitchers.get(key);
        if (stitcher) {
          try {
            const verdict = await stitcher.stitchAndParse(result.text);
            await this.writeTelemetry(slot, def.provider, def.model, pipeline, url, 'done', `stitch-repaired verdict from ${key}`);
            return { verdict, bucket: key, path };
          } catch {
            // fall through
          }
        }
        log.warn({ provider: def.provider, model: def.model }, 'non-JSON verdict, no stitcher or stitch failed');
        continue;
      }
    }

    throw new Error(`LlmRouter: all buckets exhausted for slot=${slot} pipeline=${pipeline}; path=${path.join(' → ')}`);
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
}

/**
 * Standalone convenience: create a default router and complete one audit.
 * Telemetry is a no-op sink when no sink is provided.
 */
export async function complete(opts: CompleteOptions): Promise<CompleteResult> {
  const router = new LlmRouter();
  return router.complete(opts);
}
