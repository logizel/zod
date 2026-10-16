/** Job portal list-fn table + fan-out (mirrors PORTAL_LIST_FNS / getPortalCandidates).
 *
 * Greenhouse only in this plan; extended by plan 05-02 (Lever, Ashby, HN,
 * Cutshort, Cuvette, Workday). URL dedupe applied across all sources.
 */

import { PollCandidate } from '../ctftime.js';
import { list as listGreenhouse } from './greenhouse.js';

/** All job portal adapter list functions (D-01). */
export const JOB_LIST_FNS: readonly (() => Promise<PollCandidate[]>)[] = [
  listGreenhouse,
];

/** Fetch candidates from all job portal adapters, merged and deduplicated by URL. */
export async function getJobCandidates(): Promise<PollCandidate[]> {
  const results = await Promise.all(JOB_LIST_FNS.map((fn) => fn()));
  const merged = results.flat();
  const seen = new Set<string>();
  return merged.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}
