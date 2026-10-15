import * as z from 'zod';
import { extractPastDate } from './expiry.js';
import { isSpam } from './spam.js';

const ScoutInput = z.object({
  title: z.string().min(1),
  snippet: z.string(),
});
export type ScoutInput = z.infer<typeof ScoutInput>;

export type PrefilterResult =
  | { verdict: 'pass' }
  | { verdict: 'reject'; reason: 'expired' | 'spam'; detail: string };

/**
 * Pure prefilter: expiry check first, then spam (D-19). Zero fetch, zero I/O.
 * zod validates input at the boundary.
 */
export function prefilter(input: ScoutInput | unknown): PrefilterResult {
  const parsed = ScoutInput.parse(input);
  const past = extractPastDate(`${parsed.title} ${parsed.snippet}`);
  if (past) {
    return { verdict: 'reject', reason: 'expired', detail: `past date ${past.toISOString()}` };
  }
  if (isSpam(parsed.title, parsed.snippet)) {
    return { verdict: 'reject', reason: 'spam', detail: 'blocked keyword matched' };
  }
  return { verdict: 'pass' };
}

export { extractPastDate } from './expiry.js';
export { isSpam } from './spam.js';
