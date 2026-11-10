// LlmRouter machine-event emission (the Glass feed's LLM rows).
// Adapters are mocked; no network calls, no LLM quota burned.

import { describe, expect, it, vi } from 'vitest';
import { LlmRouter, type CompleteOptions, type TelemetrySink, type LlmMachineEvent } from './router.js';
import type { ChatOutcome, ChatResult, ChatMessage } from './adapters/groq.js';
import { LadderConfig, type LadderBucketDef } from './ladder.js';
import { BucketRegistry } from './bucket.js';

function bucket(provider: string, model: string, tier: 'tier1' | 'tier2'): LadderBucketDef {
  return {
    provider,
    model,
    tier,
    capability: { supportsJSON: true, maxOutputTokens: 4096, costTier: 'zero' },
  } as unknown as LadderBucketDef;
}

type Sink = TelemetrySink & { events: LlmMachineEvent[] };

function makeSink(): Sink {
  const events: LlmMachineEvent[] = [];
  return {
    events,
    writeBucketState: vi.fn(async () => {}),
    recordMachineEvent: (event) => {
      events.push(event);
    },
  };
}

function buildRouter(
  tier1: LadderBucketDef[],
  tier2: LadderBucketDef[],
  outcomes: Record<string, ChatOutcome>,
  stitches: Record<string, unknown> = {},
): { router: LlmRouter; sink: Sink } {
  const ladder = new LadderConfig({ includePaidOptIn: false });
  (ladder as any).tier1 = tier1;
  (ladder as any).tier2 = tier2;
  (ladder as any).all = [...tier1, ...tier2];

  const sink = makeSink();
  const router = new LlmRouter(sink, { ladder });
  const internals = router as unknown as {
    adapters: Map<string, { chat: (m: ChatMessage[]) => Promise<ChatOutcome> }>;
    stitchers: Map<string, { stitchAndParse: () => Promise<unknown> }>;
    registry: BucketRegistry;
  };
  internals.registry = new BucketRegistry([...tier1, ...tier2]);
  for (const [key, outcome] of Object.entries(outcomes)) {
    internals.adapters.set(key, { chat: vi.fn(async () => outcome) } as never);
    internals.stitchers.set(key, {
      stitchAndParse: vi.fn(async () => {
        if (!(key in stitches)) throw new Error('stitch not configured');
        return stitches[key];
      }),
    } as never);
  }
  return { router, sink };
}

const OPTIONS: CompleteOptions = {
  messages: [{ role: 'system', content: 'You are an auditor' }],
  step1: '',
  step2: '',
  slot: 'auditor-events-1',
  pipeline: 'events',
  url: 'https://example.com/event/1',
  trace_id: 'trace-123',
  agent: 'orchestrator:events',
};

describe('LlmRouter machine events', () => {
  it('emits attempt start + ok with provider, model, duration and trace', async () => {
    const def = bucket('groq', 'openai/gpt-oss-120b', 'tier1');
    const { router, sink } = buildRouter(
      [def],
      [],
      { 'groq:openai/gpt-oss-120b': { text: '{"ok":true}', finishReason: 'stop' } as ChatResult },
    );

    await router.complete(OPTIONS);

    const attempt = sink.events.filter((e) => e.tool === 'llm.attempt');
    expect(attempt.map((e) => e.status)).toEqual(['start', 'ok']);
    expect(attempt[0]?.provider).toBe('groq');
    expect(attempt[0]?.model).toBe('openai/gpt-oss-120b');
    expect(attempt[0]?.trace_id).toBe('trace-123');
    expect(attempt[0]?.agent).toBe('orchestrator:events');
    expect(attempt[1]?.duration_ms).toBeGreaterThanOrEqual(0);
    expect(attempt[1]?.output_summary).toContain('verdict parsed');
  });

  it('emits a cooldown event with baton_to on a 429', async () => {
    const first = bucket('groq', 'openai/gpt-oss-120b', 'tier1');
    const second = bucket('mistral', 'mistral-small-latest', 'tier1');
    const { router, sink } = buildRouter(
      [first, second],
      [],
      {
        'groq:openai/gpt-oss-120b': { error: 'rate_limited', retryAfter: 60 },
        'mistral:mistral-small-latest': { text: '{"ok":true}', finishReason: 'stop' } as ChatResult,
      },
    );

    await router.complete(OPTIONS);

    const cooldown = sink.events.find((e) => e.status === 'cooldown');
    expect(cooldown).toBeDefined();
    expect(cooldown?.provider).toBe('groq');
    expect(cooldown?.baton_to).toBe('mistral:mistral-small-latest');
    expect(cooldown?.detail).toContain('429');
    expect(cooldown?.meta?.['retryAfter']).toBe(60);
  });

  it('emits stitch events when a length violation is repaired', async () => {
    const def = bucket('groq', 'openai/gpt-oss-120b', 'tier1');
    const { router, sink } = buildRouter(
      [def],
      [],
      { 'groq:openai/gpt-oss-120b': { error: 'length_violation' } },
      { 'groq:openai/gpt-oss-120b': { ok: true } },
    );

    await router.complete(OPTIONS);

    const stitch = sink.events.filter((e) => e.tool === 'llm.stitch');
    expect(stitch.map((e) => e.status)).toEqual(['start', 'ok']);
    expect(sink.events.some((e) => e.tool === 'llm.attempt' && e.status === 'error')).toBe(true);
  });

  it('emits an exhaustion event when every bucket is unavailable', async () => {
    const def = bucket('groq', 'openai/gpt-oss-120b', 'tier1');
    const { router, sink } = buildRouter([def], [], {
      'groq:openai/gpt-oss-120b': { error: 'rate_limited', retryAfter: 60 },
    });

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toBe('UNVERIFIED');
    const exhausted = sink.events.find((e) => e.tool === 'llm.exhausted');
    expect(exhausted).toBeDefined();
    expect(exhausted?.status).toBe('error');
    expect(exhausted?.trace_id).toBe('trace-123');
  });

  it('emits a pool-saturation event when the shared pool is full', async () => {
    const def = bucket('groq', 'openai/gpt-oss-120b', 'tier1');
    const { router, sink } = buildRouter(
      [def],
      [],
      { 'groq:openai/gpt-oss-120b': { text: '{"ok":true}', finishReason: 'stop' } as ChatResult },
    );
    // Saturate the queue so the admission control denies the call.
    const queue = (router as unknown as { queue: { admit: () => string | null } }).queue;
    vi.spyOn(queue, 'admit').mockReturnValue(null);

    const result = await router.complete({ ...OPTIONS, priority: 2 });

    expect(result.verdict).toBe('POOL_SATURATED');
    const pool = sink.events.find((e) => e.tool === 'llm.pool');
    expect(pool?.status).toBe('skip');
    expect(pool?.detail).toContain('in-flight cap');
  });
});
