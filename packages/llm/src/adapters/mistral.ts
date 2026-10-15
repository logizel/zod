// Mistral adapter — OpenAI-compatible-ish client with baseURL override.
// https://api.mistral.ai/v1  |  Tier 2 overflow, free API keys.

import OpenAI from 'openai';
import type { ChatMessage, ChatResult, ChatOutcome } from './groq.js';

export interface RateLimitedOutcome {
  error: 'rate_limited';
  retryAfter: number;
}

export interface LengthViolationOutcome {
  error: 'length_violation';
}

const DEFAULT_MODEL = 'mistral-small-latest';
const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';

export class MistralAdapter {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL, baseURL?: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL ?? MISTRAL_BASE_URL,
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
      const apiErr = err as { status?: number; headers?: Record<string, string | null | undefined>; message?: string };

      if (apiErr.status === 429) {
        return { error: 'rate_limited', retryAfter: this.parseRetryAfter(apiErr.headers) };
      }

      if (apiErr.status === 413) {
        return { error: 'length_violation' };
      }

      throw err;
    }
  }

  private parseRetryAfter(headers?: Record<string, string | null | undefined>): number {
    const raw = headers?.['retry-after'] ?? headers?.['Retry-After'] ?? headers?.['retry_after'];
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 60;
  }
}
