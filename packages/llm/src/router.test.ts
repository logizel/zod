// LlmRouter tests — baton-pass, length-stitch, zero re-scrape, Cerebras absent,
// Tier1→Tier2 overflow, circuit-breaker default-deny, UNVERIFIED on exhaustion.
// Adapters are mocked; no network calls.

import { describe, expect, it, vi } from 'vitest';
import {
  LlmRouter,
  type CompleteOptions,
  type TelemetrySink,
  type CompleteResult,
} from './router.js';
import type { ChatOutcome, ChatResult, ChatMessage } from './adapters/groq.js';
import { LadderConfig, DEFAULT_LADDER, type LadderBucketDef } from './ladder.js';
import { PriorityQueue, type Priority } from './priority.js';
import { SpendCircuitBreaker } from './circuit-breaker.js';
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

function makeTelemetrySink(): TelemetrySink & { writes: unknown[] } {
  const writes: unknown[] = [];
  return {
    writes,
    writeBucketState: vi.fn(async (_input: unknown) => {
      writes.push(_input);
    }),
  };
}

const OPTIONS: CompleteOptions = {
  messages: [{ role: 'system', content: 'You are an auditor' }],
  step1: 'Unstop hackathon listing',
  step2: 'official event page markdown',
  slot: 'auditor-events-1',
  pipeline: 'events',
  url: 'https://unstop.com/hackathon/123',
};

type RouterInternals = {
  adapters: Map<string, { chat: (m: ChatMessage[]) => Promise<ChatOutcome> }>;
  stitchers: Map<string, { stitchAndParse: () => Promise<unknown> }>;
  registry: BucketRegistry;
};

function buildRouterWithLadder(
  tier1: LadderBucketDef[],
  tier2: LadderBucketDef[],
  outcomes: Record<string, ChatOutcome>,
  stitches?: Record<string, unknown>,
): { router: LlmRouter; telemetry: TelemetrySink & { writes: unknown[] }; registry: BucketRegistry } {
  const ladder = new LadderConfig({ includePaidOptIn: false });
  // Override the static tables for deterministic tests.
  (ladder as any).tier1 = tier1;
  (ladder as any).tier2 = tier2;
  (ladder as any).all = [...tier1, ...tier2];

  const telemetry = makeTelemetrySink();
  const router = new LlmRouter(telemetry, { ladder });

  const internals = router as unknown as RouterInternals;
  internals.registry = new BucketRegistry([...tier1, ...tier2]);

  for (const [key, outcome] of Object.entries(outcomes)) {
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

  return { router, telemetry, registry: internals.registry };
}

describe('LlmRouter.complete', () => {
  it('Cerebras is absent from the default ladder', () => {
    const router = new LlmRouter();
    const providers = router.getBucketStates().map((b) => b.provider);
    expect(providers).toContain('groq');
    expect(providers).toContain('openrouter');
    expect(providers).not.toContain('cerebras');
  });

  it('LadderConfig asserts no Cerebras', () => {
    const bad = new LadderConfig();
    (bad as any).all = [{ provider: 'cerebras', model: 'llama3.1-8b', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } }];
    expect(() => bad.assertNoCerebras()).toThrow(/Cerebras/);
  });

  it('path lists every bucket attempted in ladder order (tier-prefixed)', () => {
    const router = new LlmRouter();
    const states = router.getBucketStates();
    const ladder = states.map((b) => `${b.tier}/${b.provider}/${b.model}`);
    expect(ladder.length).toBe(DEFAULT_LADDER.all.length);
    expect(ladder).toContain('tier1/groq/openai/gpt-oss-120b');
    expect(ladder.some((p) => p.includes('cerebras'))).toBe(false);
  });

  it('default ladder uses the best Groq free model and excludes retired providers', () => {
    const groqModels = DEFAULT_LADDER.tier1
      .filter((d) => d.provider === 'groq')
      .map((d) => d.model);
    expect(groqModels).toEqual(['openai/gpt-oss-120b']);
    expect(DEFAULT_LADDER.all.some((d) => d.provider === 'github')).toBe(false);
    expect(
      DEFAULT_LADDER.all.some((d) =>
        /llama-3\.1-8b-instant|llama-3\.3-70b-versatile|llama-4-scout/.test(d.model),
      ),
    ).toBe(false);
  });

  it('default ladder Tier1 has one free Groq model, plus SambaNova only on paid opt-in', () => {
    // Without explicit paid opt-in, only the free Groq bucket is active.
    const tier1NoKey = DEFAULT_LADDER.tier1;
    expect(tier1NoKey).toHaveLength(1);
    expect(tier1NoKey.filter((d) => d.provider === 'groq')).toHaveLength(1);
    expect(tier1NoKey.some((d) => d.provider === 'sambanova')).toBe(false);

    // With operator opt-in, SambaNova joins Tier1.
    const tier1WithKey = new LadderConfig({ includePaidOptIn: true }).tier1;
    expect(tier1WithKey).toHaveLength(2);
    expect(tier1WithKey.filter((d) => d.provider === 'groq')).toHaveLength(1);
    expect(tier1WithKey.filter((d) => d.provider === 'sambanova')).toHaveLength(1);

    // Cerebras absent in both.
    expect(DEFAULT_LADDER.all.some((d) => d.provider === 'cerebras')).toBe(false);
    expect(new LadderConfig({ includePaidOptIn: true }).all.some((d) => d.provider === 'cerebras')).toBe(false);
  });

  it('default ladder Tier2 excludes Cerebras', () => {
    expect(DEFAULT_LADDER.tier2.some((d) => d.provider === 'cerebras')).toBe(false);
    expect(DEFAULT_LADDER.tier2.length).toBeGreaterThan(0);
  });

  it('returns verdict from first bucket on success, writes telemetry', async () => {
    const { router, telemetry } = buildRouterWithLadder(
      [{ provider: 'groq', model: 'llama-3.1-8b-instant', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } }],
      [],
      { 'groq:llama-3.1-8b-instant': makeChatResult('{"verdict":"approved","score":95}') },
    );

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'approved', score: 95 });
    expect(result.bucket).toBe('tier1/groq:llama-3.1-8b-instant');
    expect(result.path).toEqual(['tier1/groq:llama-3.1-8b-instant']);
    expect(telemetry.writes.length).toBeGreaterThanOrEqual(1);
    const lastWrite = telemetry.writes[telemetry.writes.length - 1] as { status: string };
    expect(lastWrite.status).toBe('done');
  });

  it('forced 429 on Groq: marks cooldown, falls back to next Tier1 bucket, zero re-scrape', async () => {
    const { router, telemetry } = buildRouterWithLadder(
      [
        { provider: 'groq', model: 'llama-3.1-8b-instant', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } },
        { provider: 'github', model: 'gpt-4.1-mini', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } },
      ],
      [],
      {
        'groq:llama-3.1-8b-instant': makeRateLimited(60),
        'github:gpt-4.1-mini': makeChatResult('{"verdict":"approved","score":88}'),
      },
    );

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'approved', score: 88 });
    expect(result.bucket).toBe('tier1/github:gpt-4.1-mini');
    expect(result.path).toEqual(['tier1/groq:llama-3.1-8b-instant', 'tier1/github:gpt-4.1-mini']);

    const statuses = telemetry.writes.map((w) => (w as { status: string }).status);
    expect(statuses).toContain('cooldown');
    expect(statuses).toContain('done');
  });

  it('Tier2 engaged only when ALL Tier1 buckets unavailable', async () => {
    const { router } = buildRouterWithLadder(
      [
        { provider: 'groq', model: 'llama-3.1-8b-instant', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } },
      ],
      [
        { provider: 'mistral', model: 'mistral-small-latest', tier: 'tier2', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } },
      ],
      {
        'groq:llama-3.1-8b-instant': makeRateLimited(60),
        'mistral:mistral-small-latest': makeChatResult('{"verdict":"overflow"}'),
      },
    );
    // Mark the only Tier1 bucket unavailable so Tier2 engages.
    router.getBucketStates(); // touch
    const internals = router as unknown as RouterInternals;
    internals.registry.markDailyCap('groq', 'llama-3.1-8b-instant');

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'overflow' });
    expect(result.bucket).toBe('tier2/mistral:mistral-small-latest');
    expect(result.path).toEqual(['tier1/groq:llama-3.1-8b-instant', 'tier2/mistral:mistral-small-latest']);
  });

  it('Tier2 NOT engaged while a Tier1 bucket is READY', async () => {
    const mistral = vi.fn(async () => makeChatResult('{"verdict":"should-not-run"}'));
    const { router } = buildRouterWithLadder(
      [
        { provider: 'groq', model: 'llama-3.1-8b-instant', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } },
      ],
      [
        { provider: 'mistral', model: 'mistral-small-latest', tier: 'tier2', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } },
      ],
      {
        'groq:llama-3.1-8b-instant': makeChatResult('{"verdict":"tier1-ok"}'),
        'mistral:mistral-small-latest': makeChatResult('{"verdict":"should-not-run"}'),
      },
    );
    const internals = router as unknown as RouterInternals;
    internals.adapters.set('mistral:mistral-small-latest', mistral as never);

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'tier1-ok' });
    expect(mistral).not.toHaveBeenCalled();
    expect(result.path).toEqual(['tier1/groq:llama-3.1-8b-instant']);
  });

  it('finish_reason:length triggers stitch and returns complete JSON', async () => {
    const { router } = buildRouterWithLadder(
      [{ provider: 'groq', model: 'llama-3.1-8b-instant', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } }],
      [],
      { 'groq:llama-3.1-8b-instant': makeChatResult('{"verdict":"approved","score":', 'length') },
      { 'groq:llama-3.1-8b-instant': { verdict: 'stitched' } },
    );

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'stitched' });
    expect(result.bucket).toBe('tier1/groq:llama-3.1-8b-instant');
  });

  it('all buckets exhausted → UNVERIFIED, never throws, never Cerebras', async () => {
    const { router } = buildRouterWithLadder(
      [{ provider: 'groq', model: 'llama-3.1-8b-instant', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } }],
      [{ provider: 'mistral', model: 'mistral-small-latest', tier: 'tier2', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } }],
      {
        'groq:llama-3.1-8b-instant': makeRateLimited(60),
        'mistral:mistral-small-latest': makeRateLimited(60),
      },
    );

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toBe('UNVERIFIED');
    expect(result.bucket).toBeNull();
    expect(result.reason).toContain('all buckets exhausted');
    expect(result.path.some((p) => p.includes('cerebras'))).toBe(false);
  });

  it('413 length violation → stitch or fallback, never blind retry, never crash', async () => {
    const { router } = buildRouterWithLadder(
      [
        { provider: 'groq', model: 'llama-3.1-8b-instant', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } },
        { provider: 'github', model: 'gpt-4.1-mini', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } },
      ],
      [],
      {
        'groq:llama-3.1-8b-instant': makeLengthViolation(),
        'github:gpt-4.1-mini': makeChatResult('{"verdict":"ok","score":77}'),
      },
    );

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'ok', score: 77 });
    expect(result.bucket).toBe('tier1/github:gpt-4.1-mini');
  });

  it('step1 and step2 are passed to the adapter (zero re-scrape)', async () => {
    const groqAdapter = makeMockAdapter(makeChatResult('{"verdict":"ok"}'));
    const telemetry = makeTelemetrySink();
    const router = new LlmRouter(telemetry, { ladder: DEFAULT_LADDER });
    const internals = router as unknown as RouterInternals;
    internals.adapters.set('groq:openai/gpt-oss-120b', groqAdapter as never);

    await router.complete(OPTIONS);

    const callArgs = (groqAdapter.chat as unknown as { mock: { calls: [ChatMessage[]][] } }).mock.calls[0][0];
    const joined = callArgs.map((m) => m.content).join('\n');
    expect(joined).toContain('step_1: Unstop hackathon listing');
    expect(joined).toContain('step_2: official event page markdown');
    expect(joined).not.toContain(OPTIONS.url);
  });

  it('circuit-breaker default-denies paid-opt-in SambaNova without opt-in', async () => {
    // Default ladder excludes SambaNova (no key) → verify breaker denies paid tier.
    const breaker = new SpendCircuitBreaker({ paidOptIn: false });
    const evalRes = breaker.evaluate({
      provider: 'sambanova',
      model: 'Meta-Llama-3.3-70B-Instruct',
      costTier: 'paid-opt-in',
      projectedCost: 0,
    });
    expect(evalRes.verdict).toBe('PARK');
    expect(evalRes.reason).toContain('opt-in');
    expect(breaker.isParked('sambanova', 'Meta-Llama-3.3-70B-Instruct')).toBe(true);
  });

  it('circuit-breaker allows paid-opt-in SambaNova with operator opt-in', () => {
    const breaker = new SpendCircuitBreaker({ paidOptIn: true });
    const evalRes = breaker.evaluate({
      provider: 'sambanova',
      model: 'Meta-Llama-3.3-70B-Instruct',
      costTier: 'paid-opt-in',
      projectedCost: 0,
    });
    expect(evalRes.verdict).toBe('ALLOW');
  });

  it('circuit-breaker parks on zero-cost budget breach', () => {
    const breaker = new SpendCircuitBreaker({ zeroCostBudget: 0 });
    const evalRes = breaker.evaluate({
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      costTier: 'zero',
      projectedCost: 5,
    });
    expect(evalRes.verdict).toBe('PARK');
    expect(evalRes.reason).toContain('zero-cost budget');
  });

  it('auto-resumes parked buckets at UTC midnight (time-driven)', () => {
    const breaker = new SpendCircuitBreaker({ paidOptIn: false });
    breaker.evaluate({
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      costTier: 'paid-opt-in',
      projectedCost: 0,
    });
    expect(breaker.isParked('groq', 'llama-3.1-8b-instant')).toBe(true);
    // Force the parked-until to the past → auto-resume on next isParked/evaluate.
    (breaker as any).parked.set('groq:llama-3.1-8b-instant', Date.now() - 1000);
    expect(breaker.isParked('groq', 'llama-3.1-8b-instant')).toBe(false);
  });

  it('priority queue: Curator dequeued before Scout when both pending', () => {
    const queue = new PriorityQueue<{ id: string }>();
    const scoutId = queue.enqueue({ id: 'scout' }, 3);
    const curatorId = queue.enqueue({ id: 'curator' }, 1);
    expect(scoutId).toBeTruthy();
    expect(curatorId).toBeTruthy();

    const first = queue.dequeue();
    expect(first).toBeTruthy();
    expect(first!.payload.id).toBe('curator');
    const second = queue.dequeue();
    expect(second).toBeTruthy();
    expect(second!.payload.id).toBe('scout');
  });

  it('priority queue: per-lane + global in-flight caps enforced', () => {
    const queue = new PriorityQueue<{ id: string }>({ perLaneCaps: { 1: 1, 2: 1, 3: 1 }, globalCap: 2 });
    expect(queue.enqueue({ id: 'a' }, 1)).toBeTruthy(); // lane 1 now at cap
    expect(queue.enqueue({ id: 'c' }, 1)).toBeNull(); // lane 1 full → rejected
    expect(queue.enqueue({ id: 'b' }, 2)).toBeTruthy(); // lane 2 admitted
    const first = queue.dequeue();
    expect(first).toBeTruthy();
    expect(first!.payload.id).toBe('a'); // Curator first
    expect(queue.globalInFlight()).toBe(1);
    const second = queue.dequeue();
    expect(second).toBeTruthy();
    expect(second!.payload.id).toBe('b');
    expect(queue.globalInFlight()).toBe(2); // at global cap
    expect(queue.dequeue()).toBeNull(); // global full
    queue.complete(first!.id);
    expect(queue.dequeue()).toBeNull(); // no pending left
  });

  it('router integrates priority queue: POOL_SATURATED when global cap full', async () => {
    const queue = new PriorityQueue({ perLaneCaps: { 1: 10, 2: 10, 3: 10 }, globalCap: 0 });
    const ladder = new LadderConfig({ includePaidOptIn: false });
    (ladder as any).tier1 = [{ provider: 'groq', model: 'llama-3.1-8b-instant', tier: 'tier1', capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' } }];
    (ladder as any).tier2 = [];
    (ladder as any).all = (ladder as any).tier1;    const telemetry = makeTelemetrySink();
    const router = new LlmRouter(telemetry, { ladder, queue });
    const internals = router as unknown as RouterInternals;
    internals.adapters.set('groq:llama-3.1-8b-instant', makeMockAdapter(makeChatResult('{"verdict":"ok"}')) as never);

    const result = await router.complete({ ...OPTIONS, priority: 3 });

    expect(result.verdict).toBe('POOL_SATURATED');
    expect(result.reason).toContain('in-flight cap');
  });

  it('full-ladder fallback matrix: every Tier1 unavailable → Tier2 engaged → valid JSON verdict', async () => {
    const tier1 = DEFAULT_LADDER.tier1; // one free Groq model without paid opt-in
    const tier2 = DEFAULT_LADDER.tier2;
    expect(tier1.length).toBeGreaterThan(0);
    expect(tier2.length).toBeGreaterThan(0);

    const outcomes: Record<string, ChatOutcome> = {};
    for (const d of tier1) outcomes[`${d.provider}:${d.model}`] = makeRateLimited(60);
    for (const d of tier2) outcomes[`${d.provider}:${d.model}`] = makeRateLimited(60);
    const lastTier2 = tier2[tier2.length - 1];
    outcomes[`${lastTier2.provider}:${lastTier2.model}`] = makeChatResult(
      '{"verdict":"overflow-matrix","score":91}',
    );

    const { router } = buildRouterWithLadder(tier1, tier2, outcomes);
    // Mark every Tier1 bucket unavailable so Tier2 is the only path.
    const internals = router as unknown as RouterInternals;
    for (const d of tier1) internals.registry.markDailyCap(d.provider, d.model);

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'overflow-matrix', score: 91 });
    expect(result.bucket).toBe(`tier2/${lastTier2.provider}:${lastTier2.model}`);
    // Path walked every Tier1 bucket then the Tier2 bucket.
    for (const d of tier1) expect(result.path).toContain(`tier1/${d.provider}:${d.model}`);
    expect(result.path).toContain(`tier2/${lastTier2.provider}:${lastTier2.model}`);
    expect(result.path.some((p) => p.includes('cerebras'))).toBe(false);
  });
});
