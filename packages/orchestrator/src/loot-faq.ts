// Loot FAQ reader: resolves the official rules/FAQ page within the 2-hop
// Link-Hopper cap through the SSRF-guarded hop, then fetches and sanitizes
// the text (capped at 8000). Returns null on hop/fetch failure — no
// unfetched content is ever audited (T-05-20).
//
// D-13: loot verification depth = deterministic prefilter + auditor FAQ read
// within the existing 2-hop Link-Hopper cap.

import { resolveOfficialDomain } from '@zod/discord-router/link-hop';
import { fetch } from '@zod/sanitize';

/** Read the official loot rules/FAQ page. Capped at 8000 chars; null on failure. */
export async function readLootRules(url: string): Promise<string | null> {
  // Step 1: resolve to official domain within the 2-hop cap (SSRF-guarded).
  const hop = await resolveOfficialDomain(url, 2);
  if (!hop.ok) {
    return null; // link_hop_failed — tombstoned by caller
  }

  // Step 2: fetch the final URL through the sanitize facade (Jina → browser).
  // validateUrl is applied inside fetch (SSRF guard on the fetch target too).
  let result: { markdown: string; capped: boolean; source: 'jina' | 'browser' };
  try {
    result = await fetch(hop.finalUrl);
  } catch {
    return null; // fetch failure → null, never audit unfetched content
  }

  const text = (result.markdown ?? '').slice(0, 8000);
  return text.length > 0 ? text : null;
}
