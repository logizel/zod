// Centralized length-stitch continuation prompt (D-03).
//
// On finish_reason:length the model output is truncated mid-JSON. The stitcher
// issues ONE continuation prompt ("continue exactly where you left off, output
// valid JSON only") and returns the completion to merge with the partial.
// One implementation for all adapters — router calls this, never inline stitch logic.

import type { ChatOutcome, ChatResult } from './adapters/groq.js';
import type { ChatMessage } from './adapters/groq.js';

export interface LLMAdapter {
  chat(messages: ChatMessage[]): Promise<ChatOutcome>;
}

/**
 * Continuation prompt issued when the model truncates output mid-JSON.
 * Returns the continuation text to merge with the partial buffer.
 */
const CONTINUATION_PROMPT =
  'continue exactly where you left off, output valid JSON only';

export class Stitcher {
  constructor(private adapter: LLMAdapter) {}

  /**
   * Issue one continuation prompt for the truncated partial text.
   * Returns the completion to append to the partial buffer.
   */
  async continue(partialText: string): Promise<string> {
    const outcome = await this.adapter.chat([
      { role: 'system', content: CONTINUATION_PROMPT },
      { role: 'user', content: partialText },
    ]);

    if ('error' in outcome) {
      // Stitch failures stay loud — never return truncated/malformed JSON.
      throw new Error(
        `stitch.continue: adapter returned ${outcome.error} during length-stitch`,
      );
    }

    return outcome.text;
  }

  /**
   * Merge partial + continuation and validate as JSON.
   * Returns the parsed verdict, or throws if the merged output is not valid JSON.
   */
  async stitchAndParse(partialText: string): Promise<unknown> {
    const continuation = await this.continue(partialText);
    const merged = partialText + continuation;
    return JSON.parse(merged);
  }
}
