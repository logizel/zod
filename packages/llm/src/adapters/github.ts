// GitHub Models adapter — OpenAI-compatible client with baseURL override.
// D-02: maps 429/413 responses to the same unified error shape as the Groq adapter.

import OpenAI from 'openai';

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

const DEFAULT_MODEL = 'gpt-4.1-mini';
const GITHUB_MODELS_BASE_URL = 'https://models.inference.ai.azure.com';

/**
 * GitHub Models chat completion adapter.
 * Uses the OpenAI SDK pointed at the GitHub Models inference endpoint.
 * Maps vendor error responses to the unified ChatOutcome shape.
 */
export class GitHubModelsAdapter {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL, baseURL?: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL ?? GITHUB_MODELS_BASE_URL,
      maxRetries: 0, // router owns backoff; no SDK-level retry on 429
    });
  }

  async chat(messages: ChatMessage[]): Promise<ChatOutcome> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as unknown as Parameters<OpenAI['chat']['completions']['create']>[0]['messages'],
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
      const apiErr = err as {
        status?: number;
        headers?: Record<string, string | null | undefined>;
        message?: string;
      };

      // OpenAI SDK RateLimitError for 429 — parse retry-after from headers.
      if (apiErr.status === 429 || err instanceof OpenAI.RateLimitError) {
        const retryAfter = this.parseRetryAfter(apiErr.headers);
        return { error: 'rate_limited', retryAfter };
      }

      // 413 length violation — shrink-or-stitch, never blind-retry.
      if (apiErr.status === 413) {
        return { error: 'length_violation' };
      }

      throw err;
    }
  }

  private parseRetryAfter(
    headers: Record<string, string | null | undefined> | undefined,
  ): number {
    const raw =
      headers?.['retry-after'] ??
      headers?.['Retry-After'] ??
      headers?.['retry_after'];
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 60; // default 60s cooldown per SWM-04
  }
}
