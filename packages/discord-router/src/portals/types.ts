/**
 * Shared candidate contracts for portal adapters and the scheduler tick.
 *
 * These live in the portal package (not the scheduler) so adapter imports are
 * one-way: scheduler → discord-router. The scheduler re-exports them for
 * backwards compatibility.
 */

/** Candidate emitted by a listing crawl; full text is fetched only after Scout. */
export interface PollCandidate {
  url: string;
  title: string;
  snippet: string;
  /** Location metadata from the listing (used by geo gate at audit time). */
  location?: string;
  /** Organizer/company from the listing (used by merger evidence gate). */
  organizer?: string;
  /** Epoch-ms date of the listing (used by merger ±3-day window gate). */
  dateMs?: number;
}

/** A candidate source: pipeline name + list() + optional ATS-JSON detail fetch. */
export interface CandidateSource {
  /** Pipeline this source feeds (events | jobs | loot | local | social). */
  pipeline: string;
  /** List candidates from this source (listing-first: title+snippet only). */
  list(): Promise<PollCandidate[]>;
  /** Fetch mode hint: 'ats-json' means the source has a detail() text fetch. */
  fetch?: 'ats-json';
  /** Detail text fetch for ATS-JSON sources; null → tick falls back to facade. */
  detail?: (cand: PollCandidate) => Promise<string | null>;
}
