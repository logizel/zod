import { PollCandidate } from './ctftime.js';

/**
 * CLIST.by portal adapter (api mode — official free JSON API).
 * Emits title+snippet from the listing (D-03: zero full fetch before Scout pass).
 *
 * CLIST.by API: clist.by/api/v1/json/ (requires authentication key in production;
 * tests mock the response).
 */
export async function list(opts?: { since?: Date }): Promise<PollCandidate[]> {
  const url = new URL('https://clist.by/api/v1/json/event/');
  if (opts?.since) {
    url.searchParams.set('start__gte', opts.since.toISOString());
  }

  const res = await globalThis.fetch(url.toString());
  if (!res.ok) {
    return [];
  }

  const data = (await res.json()) as {
    objects?: Array<{
      id: number;
      title: string;
      url: string;
      description: string;
      start: string;
      end: string;
    }>;
  };

  return (data.objects ?? []).map((ev) => ({
    url: ev.url,
    title: ev.title,
    snippet: ev.description.slice(0, 200),
  }));
}
