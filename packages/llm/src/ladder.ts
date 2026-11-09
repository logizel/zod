// 2D LLM ladder configuration — provider × model bucket table.
//
// Tier1: permanent free tier (Groq gpt-oss-120b) + SambaNova paid opt-in.
// Tier2: overflow (Mistral, Z.ai, NVIDIA NIM, OpenRouter :free).
//   Engages only when ALL Tier1 buckets are unavailable (COOLDOWN or DAILY-CAP).
//
// Cerebras is intentionally absent from both tiers (D-04, SWM-06).
// Zero-cost constraint: paid-opt-in providers (SambaNova developer tier) are excluded
// unless the operator opts in (includePaidOptIn).

import type { BucketDef } from './bucket.js';

export type CostTier = 'zero' | 'paid-opt-in';

export interface ProviderCapability {
  /** Whether the provider emits strict, parseable JSON (reliable verdict parsing). */
  supportsJSON: boolean;
  /** Max output tokens before finish_reason:length becomes a risk. */
  maxOutputTokens: number;
  /** costTier: 'zero' (free, no card) | 'paid-opt-in' (requires explicit operator opt-in). */
  costTier: CostTier;
}

/** A bucket definition enriched with provider-capability flags. */
export interface LadderBucketDef extends BucketDef {
  capability: ProviderCapability;
}

const GROQ_CAP: ProviderCapability = { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' };
const SAMBANOVA_CAP: ProviderCapability = { supportsJSON: true, maxOutputTokens: 8192, costTier: 'paid-opt-in' };

const MISTRAL_CAP: ProviderCapability = { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' };
const ZAI_CAP: ProviderCapability = { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' };
const NVIDIA_CAP: ProviderCapability = { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' };
const OPENROUTER_CAP: ProviderCapability = { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' };

/** Tier 1 — permanent free tiers (no credit card). SambaNova is paid-opt-in. */
export const TIER1_MODELS: LadderBucketDef[] = [
  // Best general-purpose model on Groq's free plan: 120B params, 131K context,
  // 8K TPM / 1K RPD. Replaces the retired Llama model IDs.
  { provider: 'groq', model: 'openai/gpt-oss-120b', tier: 'tier1', capability: GROQ_CAP },
  // SambaNova is paid-opt-in and is filtered out unless explicitly enabled.
  { provider: 'sambanova', model: 'Meta-Llama-3.3-70B-Instruct', tier: 'tier1', capability: SAMBANOVA_CAP },
];

/** Tier 2 — overflow; engages only after Tier1 exhausts. */
export const TIER2_MODELS: LadderBucketDef[] = [
  // Reasoning-heavy default order (events/jobs/social). Nemotron's 1M context
  // and reasoning strength wins on long event/job pages; Cohere is a
  // citation/JSON specialist and sits last here.
  { provider: 'openrouter', model: 'nvidia/nemotron-3.5-lightning:free', tier: 'tier2', capability: OPENROUTER_CAP },
  { provider: 'mistral', model: 'mistral-small-latest', tier: 'tier2', capability: MISTRAL_CAP },
  { provider: 'zai', model: 'glm-5.2', tier: 'tier2', capability: ZAI_CAP },
  { provider: 'nvidia', model: 'nemotron-3.5-lightning', tier: 'tier2', capability: NVIDIA_CAP },
  { provider: 'openrouter', model: 'cohere/north-mini-code:free', tier: 'tier2', capability: OPENROUTER_CAP },
];

/** Per-pipeline Tier2 preference order (keys are `provider:model`). */
const TIER2_REASONING_ORDER = [
  'openrouter:nvidia/nemotron-3.5-lightning:free',
  'mistral:mistral-small-latest',
  'zai:glm-5.2',
  'nvidia:nemotron-3.5-lightning',
  'openrouter:cohere/north-mini-code:free',
];

const TIER2_CITATION_ORDER = [
  'openrouter:cohere/north-mini-code:free',
  'mistral:mistral-small-latest',
  'openrouter:nvidia/nemotron-3.5-lightning:free',
  'zai:glm-5.2',
  'nvidia:nemotron-3.5-lightning',
];

/** Pipelines whose verdicts are quote/citation-heavy rather than reasoning-heavy. */
const CITATION_TASKS = new Set(['loot', 'local']);

/** Full provider × model bucket table (Tier1 + Tier2). Cerebras absent from both. */
export class LadderConfig {
  readonly tier1: LadderBucketDef[];
  readonly tier2: LadderBucketDef[];
  readonly all: LadderBucketDef[];

  constructor(opts?: { includePaidOptIn?: boolean }) {
    const includePaid = opts?.includePaidOptIn ?? false;
    this.tier1 = includePaid
      ? TIER1_MODELS
      : TIER1_MODELS.filter((d) => d.capability.costTier !== 'paid-opt-in');
    this.tier2 = TIER2_MODELS;
    this.all = [...this.tier1, ...this.tier2];
  }

  /**
   * Tier2 buckets ordered for a pipeline. Reasoning-heavy pipelines (events,
   * jobs, social) try Nemotron first; citation/JSON-heavy pipelines (loot,
   * local) try Cohere first. Unknown/custom buckets always remain reachable.
   */
  tier2For(task?: string): LadderBucketDef[] {
    const byKey = new Map(this.tier2.map((def) => [`${def.provider}:${def.model}`, def]));
    const order = task !== undefined && CITATION_TASKS.has(task)
      ? TIER2_CITATION_ORDER
      : TIER2_REASONING_ORDER;

    const ordered: LadderBucketDef[] = [];
    for (const key of order) {
      const def = byKey.get(key);
      if (def) {
        ordered.push(def);
        byKey.delete(key);
      }
    }
    // Preserve any custom/unknown tier2 buckets (tests, future providers).
    for (const def of this.tier2) {
      if (byKey.has(`${def.provider}:${def.model}`)) ordered.push(def);
    }
    return ordered;
  }

  /** Assert Cerebras is absent from both tiers (throws if mis-configured). */
  assertNoCerebras(): void {
    for (const d of this.all) {
      if (d.provider === 'cerebras' || /cerebras/i.test(d.model)) {
        throw new Error(`LadderConfig: Cerebras must not appear in bucket tables (found ${d.provider}:${d.model})`);
      }
    }
  }

  /** Provider-capability flags for a bucket, or undefined if unknown. */
  capability(provider: string, model: string): ProviderCapability | undefined {
    return this.all.find((d) => d.provider === provider && d.model === model)?.capability;
  }
}

/** Default ladder config (paid-opt-in excluded by default — zero-cost constraint). */
export const DEFAULT_LADDER = new LadderConfig();
