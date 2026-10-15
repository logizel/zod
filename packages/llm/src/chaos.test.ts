// Chaos tests — force 429 / 413 / finish_reason:length per model across the ladder.
// Every case resolves via baton-pass or stitch, never re-scrape, never crash, never Cerebras.
// Adapters are mocked; no network calls.

import { describe, expect, it, vi } from 'vitest';
import { LlmRouter, type CompleteOptions } from './router.js';
import type { ChatOutcome, ChatMessage, ChatResult } from './adapters/groq.js';
import { LadderConfig, type LadderBucketDef } from './ladder.js';
import { BucketRegistry } from './bucket.js';

function makeChatResult(text: string, finishReason: string | null = 'stop'): ChatResult {
  return { text, finishReason };
}

function makeRateLimited(retryAfter = 60): { error: 'rate_limited'; retryAfter: number } {
  return { error: 'rate_limited', retryAfter };
}

function makeLengthViolation(): { error: 'length_violation' } {
  return { error: 'length_violation' };
}

function makeMockAdapter(outcome: ChatOutcome) {
  const chat = vi.fn(async (_m: ChatMessage[]) => outcome);
  return { chat };
}

const OPTIONS: CompleteOptions = {
  messages: [{ role: 'system', content: 'You are an auditor' }],
  step1: 'Unstop hackathon listing',
  step2: 'official event page markdown',
  slot: 'chaos-auditor-1',
  pipeline: 'events',
  url: 'https://example.com/event/1',
};

type RouterInternals = {
  adapters: Map<string, { chat: (m: ChatMessage[]) => Promise<ChatOutcome> }>;
  stitchers: Map<string, { stitchAndParse: () => Promise<unknown> }>;
  registry: BucketRegistry;
};

const CAP = { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' as const };

function tier1def(provider: string, model: string): LadderBucketDef {
  return { provider, model, tier: 'tier1', capability: CAP };
}
function tier2def(provider: string, model: string): LadderBucketDef {
  return { provider, model, tier: 'tier2', capability: CAP };
}

function buildRouter(
  tier1: LadderBucketDef[],
  tier2: LadderBucketDef[],
  outcomes: Record<string, ChatOutcome>,
  stitches?: Record<string, unknown>,
): { router: LlmRouter; registry: BucketRegistry } {
  const ladder = new LadderConfig({ includePaidOptIn: false });
  (ladder as any).tier1 = tier1;
  (ladder as any).tier2 = tier2;
  (ladder as any).all = [...tier1, ...tier2];

  const router = new LlmRouter(null, { ladder });
  const internals = router as unknown as RouterInternals;
  internals.registry = new BucketRegistry([...tier1, ...tier2]);

  for (const def of [...tier1, ...tier2]) {
    const key = `${def.provider}:${def.model}`;
    const outcome = outcomes[key] ?? makeChatResult('{"verdict":"default"}');
    internals.adapters.set(key, makeMockAdapter(outcome) as never);
    const stitchResult = stitches?.[key];
    internals.stitchers.set(
      key,
      {
        stitchAndParse: vi.fn(async () => {
          if (stitchResult === undefined) throw new Error('stitch not configured');
          return stitchResult;
        }),
      } as never,
    );
  }

  return { router, registry: internals.registry };
}

const GROQ = tier1def('groq', 'llama-3.1-8b-instant');
const GITHUB = tier1def('github', 'gpt-4.1-mini');
const MISTRAL = tier2def('mistral', 'mistral-small-latest');
const ZAI = tier2def('zai', 'glm-5.2');
const NVIDIA = tier2def('nvidia', 'nemotron-3.5-lightning');

const ALL_MODELS = [GROQ, GITHUB, MISTRAL, ZAI, NVIDIA];

function nextOf(model: LadderBucketDef): LadderBucketDef {
  return ALL_MODELS[(ALL_MODELS.indexOf(model) + 1) % ALL_MODELS.length];
}

describe('chaos: forced 429 baton-pass per model', () => {
  for (const model of ALL_MODELS) {
    it(`${model.provider}:${model.model} 429 → baton-pass to next bucket, zero re-scrape`, async () => {
      const next = nextOf(model);
      // Both model and next sit in Tier1 so this is a clean within-ladder fallback.
      const { router } = buildRouter(
        [model, next],
        [],
        {
          [`${model.provider}:${model.model}`]: makeRateLimited(60),
          [`${next.provider}:${next.model}`]: makeChatResult('{"verdict":"approved","score":88}'),
        },
      );

      const result = await router.complete(OPTIONS);

      expect(result.verdict).toEqual({ verdict: 'approved', score: 88 });
      expect(result.bucket).toBe(`tier1/${next.provider}:${next.model}`);
      expect(result.path).toContain(`tier1/${model.provider}:${model.model}`);
      expect(result.path.some((p) => p.includes('cerebras'))).toBe(false);
    });
  }

  it('every Tier1 bucket 429 → Tier2 engaged → valid JSON from last-available bucket', async () => {
    const { router } = buildRouter(
      [GROQ, GITHUB],
      [MISTRAL],
      {
        'groq:llama-3.1-8b-instant': makeRateLimited(60),
        'github:gpt-4.1-mini': makeRateLimited(60),
        'mistral:mistral-small-latest': makeChatResult('{"verdict":"overflow","score":90}'),
      },
    );

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'overflow', score: 90 });
    expect(result.bucket).toBe('tier2/mistral:mistral-small-latest');
    expect(result.path).toEqual([
      'tier1/groq:llama-3.1-8b-instant',
      'tier1/github:gpt-4.1-mini',
      'tier2/mistral:mistral-small-latest',
    ]);
  });

  it('all Tier1 + Tier2 429 → UNVERIFIED + reason, no crash, no Cerebras', async () => {
    const outcomes: Record<string, ChatOutcome> = {};
    for (const m of ALL_MODELS) outcomes[`${m.provider}:${m.model}`] = makeRateLimited(60);
    const { router } = buildRouter([GROQ, GITHUB], [MISTRAL, ZAI, NVIDIA], outcomes);

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toBe('UNVERIFIED');
    expect(result.reason).toContain('all buckets exhausted');
    expect(result.path.some((p) => p.includes('cerebras'))).toBe(false);
  });
});

describe('chaos: 413 length violation per model', () => {
  for (const model of ALL_MODELS) {
    it(`${model.provider}:${model.model} 413 → fallback to next bucket, no blind retry`, async () => {
      const next = nextOf(model);
      const { router } = buildRouter(
        [model, next],
        [],
        {
          [`${model.provider}:${model.model}`]: makeLengthViolation(),
          [`${next.provider}:${next.model}`]: makeChatResult('{"verdict":"ok","score":77}'),
        },
      );

      const result = await router.complete(OPTIONS);

      expect(result.verdict).toEqual({ verdict: 'ok', score: 77 });
      expect(result.bucket).toBe(`tier1/${next.provider}:${next.model}`);
      expect(result.path.some((p) => p.includes('cerebras'))).toBe(false);
    });
  }
});

describe('chaos: finish_reason:length stitch per model', () => {
  for (const model of ALL_MODELS) {
    it(`${model.provider}:${model.model} finish_reason:length → complete JSON verdict via stitch`, async () => {
      const { router } = buildRouter(
        [model],
        [],
        {
          [`${model.provider}:${model.model}`]: makeChatResult('{"verdict":"approved","score":', 'length'),
        },
        { [`${model.provider}:${model.model}`]: { verdict: 'approved', score: 95 } },
      );

      const result = await router.complete(OPTIONS);

      expect(result.verdict).toEqual({ verdict: 'approved', score: 95 });
      expect(result.bucket).toBe(`tier1/${model.provider}:${model.model}`);
    });
  }
});
