// Chaos tests — forced 429 / 413 / finish_reason:length per model, all handled
// without crashing or re-scraping. Validates SWM-04 / SWM-05 end-to-end.

import { describe, expect, it, vi } from 'vitest';
import { LlmRouter, type CompleteOptions } from './router.js';
import type { ChatOutcome, ChatMessage } from './adapters/groq.js';

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
};

function buildRouterWithAdapters(
  groqOutcome: ChatOutcome,
  githubOutcome: ChatOutcome,
): LlmRouter {
  const router = new LlmRouter();
  const adaptersMap = (router as unknown as RouterInternals).adapters;
  adaptersMap.set('groq:llama-3.1-8b-instant', makeMockAdapter(groqOutcome) as never);
  adaptersMap.set('github:gpt-4.1-mini', makeMockAdapter(githubOutcome) as never);
  return router;
}

describe('chaos: forced 429 baton-pass', () => {
  it('Groq 429 → GitHub Models fallback returns verdict, zero re-scrape', async () => {
    const router = buildRouterWithAdapters(
      makeRateLimited(60),
      makeChatResult('{"verdict":"approved","score":88}'),
    );

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'approved', score: 88 });
    expect(result.bucket).toBe('github:gpt-4.1-mini');
    expect(result.path).toEqual(['groq:llama-3.1-8b-instant', 'github:gpt-4.1-mini']);
  });

  it('Groq 429 then GitHub 429 → all buckets exhausted throws', async () => {
    const router = buildRouterWithAdapters(
      makeRateLimited(60),
      makeRateLimited(60),
    );

    await expect(router.complete(OPTIONS)).rejects.toThrow(/all buckets exhausted/);
  });

  it('re-issues step1+step2 to fallback, never re-fetches source URL', async () => {
    const groqAdapter = makeMockAdapter(makeRateLimited(60));
    const githubAdapter = makeMockAdapter(makeChatResult('{"verdict":"ok"}'));
    const router = new LlmRouter();
    const internals = router as unknown as RouterInternals;
    internals.adapters.set('groq:llama-3.1-8b-instant', groqAdapter as never);
    internals.adapters.set('github:gpt-4.1-mini', githubAdapter as never);

    await router.complete(OPTIONS);

    const ghCalls = (githubAdapter.chat as unknown as { mock: { calls: [ChatMessage[]][] } }).mock.calls;
    expect(ghCalls.length).toBe(1);
    const joined = ghCalls[0][0].map((m) => m.content).join('\n');
    expect(joined).toContain('step_1: Unstop hackathon listing');
    expect(joined).toContain('step_2: official event page markdown');
    expect(joined).not.toContain(OPTIONS.url);
  });
});

describe('chaos: finish_reason:length stitch', () => {
  it('truncated output → stitch continuation → complete JSON', async () => {
    const router = buildRouterWithAdapters(
      makeChatResult('{"verdict":"approved","score":', 'length'),
      makeChatResult('{"verdict":"rejected"}'),
    );

    const stitcher = {
      stitchAndParse: vi.fn(async () => ({ verdict: 'approved', score: 99 })),
    };
    (router as unknown as RouterInternals).stitchers.set('groq:llama-3.1-8b-instant', stitcher as never);

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'approved', score: 99 });
    expect(result.bucket).toBe('groq:llama-3.1-8b-instant');
    expect(stitcher.stitchAndParse).toHaveBeenCalled();
  });

  it('stitch failure on truncated output → falls back to next bucket', async () => {
    const router = buildRouterWithAdapters(
      makeChatResult('{"verdict":"approved","score":', 'length'),
      makeChatResult('{"verdict":"fallback","score":50}'),
    );

    const stitcher = {
      stitchAndParse: vi.fn(async () => {
        throw new Error('stitch failed');
      }),
    };
    (router as unknown as RouterInternals).stitchers.set('groq:llama-3.1-8b-instant', stitcher as never);

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'fallback', score: 50 });
    expect(result.bucket).toBe('github:gpt-4.1-mini');
  });
});

describe('chaos: 413 length violation', () => {
  it('413 on primary → falls back to next bucket without crashing', async () => {
    const router = buildRouterWithAdapters(
      makeLengthViolation(),
      makeChatResult('{"verdict":"ok","score":77}'),
    );

    const result = await router.complete(OPTIONS);

    expect(result.verdict).toEqual({ verdict: 'ok', score: 77 });
    expect(result.bucket).toBe('github:gpt-4.1-mini');
  });
});
