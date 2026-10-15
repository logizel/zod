import * as z from 'zod';

/** Scout-shaped input: title + snippet from a portal listing (zero fetch). */
const ScoutInput = z.object({
  title: z.string().min(1),
  snippet: z.string(),
});

export type ScoutInput = z.infer<typeof ScoutInput>;

/** 80/20 domain filter verdict (D-11, EVT-02). */
export type DomainVerdict =
  | { verdict: 'pass' }
  | { verdict: 'reject'; reason: 'non-technical' | 'deep-tech-low-score'; detail: string };

/** SWE domains admitted outright (D-11: admit all SWE domains). */
const SWE_DOMAINS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'stackoverflow.com',
  'dev.to',
  'hashnode.com',
  'medium.com',
  'substack.com',
  'news.ycombinator.com',
  'lobste.rs',
]);

/** Deep-tech adjacent domains require organizer>=9 AND agenda>=9. */
const DEEP_TECH_DOMAINS = new Set([
  'arxiv.org',
  'ieee.org',
  'acm.org',
  'usenix.org',
  'ndss.org',
  'blackhat.com',
  'defcon.org',
]);

/**
 * Pure prefilter: admit SWE domains outright; admit adjacent deep-tech only at
 * organizer>=9 AND agenda>=9; reject non-technical business. Runs before any
 * fetch, before the auditor (D-11).
 */
export function prefilter(
  input: ScoutInput | unknown,
  opts?: { organizerScore?: number; agendaScore?: number },
): DomainVerdict {
  const parsed = ScoutInput.parse(input);

  // SWE domain -> pass: scan title and snippet text for known SWE hostnames
  const haystack = `${parsed.title} ${parsed.snippet}`.toLowerCase();
  for (const domain of SWE_DOMAINS) {
    if (haystack.includes(domain)) {
      return { verdict: 'pass' };
    }
  }

  const organizerScore = opts?.organizerScore ?? 0;
  const agendaScore = opts?.agendaScore ?? 0;

  // Deep-tech adjacent: only at organizer>=9 AND agenda>=9 (locked thresholds)
  if (
    organizerScore >= 9 &&
    agendaScore >= 9 &&
    parsed.snippet &&
    (parsed.snippet.toLowerCase().includes('deep-tech') ||
      parsed.snippet.toLowerCase().includes('systems') ||
      parsed.snippet.toLowerCase().includes('infosec'))
  ) {
    return { verdict: 'pass' };
  }

  return {
    verdict: 'reject',
    reason: organizerScore >= 9 || agendaScore >= 9 ? 'deep-tech-low-score' : 'non-technical',
    detail: `organizer=${organizerScore} agenda=${agendaScore}`,
  };
}
