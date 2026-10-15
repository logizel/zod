// LlmRouter tests — baton-pass, length-stitch, zero re-scrape, Cerebras absent.
// Adapters are mocked; no network calls.

import { describe, expect, it, vi } from 'vitest';
import { LlmRouter, type CompleteOptions, type TelemetrySink } from './router.js';
import type { ChatOutcome, ChatResult, ChatMessage } from './adapters/groq.js';

function makeChatResult(text: string, finishReason: string | null = 'stop'): ChatResult {
  return { text, finishReason };
}

function makeRateLimited(retryAfter = 60): { error: 'rate_limited'; retryAfter: number } {
  return { error: 'rate_limited', retryAfter };
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
};

function buildRouterWithAdapters(
  groqOutcome: ChatOutcome,
  githubOutcome: ChatOutcome,
): { router: LlmRouter; telemetry: TelemetrySink & { writes: unknown[] } } {
  const telemetry = makeTelemetrySink();
  const router = new LlmRouter(telemetry);

  const groqAdapter = makeMockAdapter(groqOutcome);
  const githubAdapter = makeMockAdapter(githubOutcome);
  const internals = router as unknown as RouterInternals;
  internals.adapters.set('groq:llama-3.1-8b-instant', groqAdapter as never);
  internals.adapters.set('github:gpt-4.1-mini', githubAdapter as never);

  return { router, telemetry };
}

describe('LlmRouter.complete', () => {
  it('Cerebras is absent from the tracer ladder', () => {
    const router = new LlmRouter();
    const providers = router.getBucketStates().map((b) => b.provider);
    expect(providers).toEqual(['groq', 'github']);
    expect(providers).not.toContain('cerebras');
  });

  it('path lists every bucket attempted in ladder order', () => {
    const router = new LlmRouter();
    const states = router.getBucketStates();
    const ladder = states.map((b) => `${b.provider}/${b.model}`);
    expect(ladder).toEqual(['groq/llama-3.1-8b-instant', 'github/gpt-4.1-mini']);
  });

  it('returns verdict from first bucket on success, writes telemetry', async () => {
    const { router, telemetry } = buildRouterWithAdapters(
      makeChatResult('{"verdict":"approved","score":95}'),
      makeChatResult('{"verdict":"rejected"}'),
    );

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'approved', score: 95 });
    expect(result.bucket).toBe('groq:llama-3.1-8b-instant');
    expect(result.path).toEqual(['groq:llama-3.1-8b-instant']);
    expect(telemetry.writes.length).toBeGreaterThanOrEqual(1);
    const lastWrite = telemetry.writes[telemetry.writes.length - 1] as { status: string };
    expect(lastWrite.status).toBe('done');
  });

  it('forced 429 on Groq: marks cooldown, falls back to GitHub Models, zero re-scrape', async () => {
    const { router, telemetry } = buildRouterWithAdapters(
      makeRateLimited(60),
      makeChatResult('{"verdict":"approved","score":88}'),
    );

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'approved', score: 88 });
    expect(result.bucket).toBe('github:gpt-4.1-mini');
    expect(result.path).toEqual(['groq:llama-3.1-8b-instant', 'github:gpt-4.1-mini']);

    const statuses = telemetry.writes.map((w) => (w as { status: string }).status);
    expect(statuses).toContain('cooldown');
    expect(statuses).toContain('done');
  });

  it('finish_reason:length triggers stitch and returns complete JSON', async () => {
    const { router } = buildRouterWithAdapters(
      makeChatResult('{"verdict":"approved","score":', 'length'),
      makeChatResult('{"verdict":"rejected"}'),
    );

    const stitcher = {
      stitchAndParse: vi.fn(async () => ({ verdict: 'approved', score: 95 })),
    };
    const internals = router as unknown as RouterInternals;
    internals.stitchers.set('groq:llama-3.1-8b-instant', stitcher as never);

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'approved', score: 95 });
    expect(result.bucket).toBe('groq:llama-3.1-8b-instant');
    expect(stitcher.stitchAndParse).toHaveBeenCalled();
  });

  it('all buckets exhausted throws with path in error message', async () => {
    const { router } = buildRouterWithAdapters(
      makeRateLimited(60),
      makeRateLimited(60),
    );

    await expect(router.complete(OPTIONS)).rejects.toThrow(/all buckets exhausted/);
  });

  it('step1 and step2 are passed to the adapter (zero re-scrape)', async () => {
    const groqAdapter = makeMockAdapter(makeChatResult('{"verdict":"ok"}'));
    const telemetry = makeTelemetrySink();
    const router = new LlmRouter(telemetry);
    const internals = router as unknown as RouterInternals;
    internals.adapters.set('groq:llama-3.1-8b-instant', groqAdapter as never);
    internals.adapters.set('github:gpt-4.1-mini', makeMockAdapter(makeChatResult('{"verdict":"ok"}')) as never);

    await router.complete(OPTIONS);

    const callArgs = (groqAdapter.chat as unknown as { mock: { calls: [ChatMessage[]][] } }).mock.calls[0][0];
    const joined = callArgs.map((m) => m.content).join('\n');
    expect(joined).toContain('step_1: Unstop hackathon listing');
    expect(joined).toContain('step_2: official event page markdown');
    expect(joined).not.toContain(OPTIONS.url);
  });
});
