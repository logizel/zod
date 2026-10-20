import type { PollCandidate } from './types.js';

export type { PollCandidate };

/**
 * CTFtime portal adapter (api mode — official free JSON API).
 * Emits title+snippet from the listing only (D-03: zero fetch on listing;
 * full fetch happens only for Scout survivors).
 *
 * CTFtime API: ctftime.org/api/v1/events/
 */
export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  const since = opts?.since;
  const url = new URL('https://ctftime.org/api/v1/events/');
  if (since) {
    url.searchParams.set('start', Math.floor(since.getTime() / 1000).toString());
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    return [];
  }

  const data = (await res.json()) as Array<{
    id: number;
    title: string;
    url: string;
    description: string;
    start: string;
    finish: string;
  }>;

  return data
    .filter((ev) => {
      if (since) {
        const evStart = new Date(ev.start);
        return evStart >= since;
      }
      return true;
    })
    .map((ev) => ({
      url: ev.url,
      title: ev.title,
      snippet: ev.description.slice(0, 200),
    }));
}
