// Groq adapter — first-party groq-sdk for Tier 1.
// D-02: detects 429 via Groq.RateLimitError + Retry-After header parsing.
// Detects 413 length violation as shrink-or-stitch signal, never blind-retry.

import Groq, { RateLimitError as GroqRateLimitError } from 'groq-sdk';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  finishReason: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface RateLimitedOutcome {
  error: 'rate_limited';
  retryAfter: number;
}

export interface LengthViolationOutcome {
  error: 'length_violation';
}

export type ChatOutcome = ChatResult | RateLimitedOutcome | LengthViolationOutcome;

const DEFAULT_MODEL = 'llama-3.1-8b-instant';

/**
 * Groq chat completion adapter.
 * Maps vendor SDK error types to a unified outcome shape for the router.
 */
export class GroqAdapter {
  private client: Groq;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL, baseURL?: string) {
    this.model = model;
    this.client = new Groq({
      apiKey,
      baseURL: baseURL ?? undefined,
      maxRetries: 0, // router owns backoff; no SDK-level retry on 429
    });
  }

  async chat(messages: ChatMessage[]): Promise<ChatOutcome> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as unknown as Parameters<Groq['chat']['completions']['create']>[0]['messages'],
        temperature: 0.3,
      });

      const choice = response.choices[0];
      return {
        text: choice.message.content ?? '',
        finishReason: choice.finish_reason ?? null,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err: unknown) {
      // D-02: vendor SDK error-type detection — RateLimitError for 429.
      if (err instanceof GroqRateLimitError) {
        const retryAfter = this.parseRetryAfter(err);
        return { error: 'rate_limited', retryAfter };
      }

      // 413 length violation — treat as shrink-or-stitch, never blind-retry.
      const apiErr = err as { status?: number; message?: string; headers?: { get?: (key: string) => string | null } };
      if (apiErr.status === 413 || (apiErr.headers?.get && apiErr.headers.get('content-length') === null)) {
        return { error: 'length_violation' };
      }

      throw err;
    }
  }

  private parseRetryAfter(err: GroqRateLimitError): number {
    const header = err.headers?.get?.('retry-after');
    if (header) {
      const parsed = Number(header);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 60; // default 60s cooldown per SWM-04
  }
}
