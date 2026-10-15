import { validateUrl, _isPrivateHostForTests as isPrivateHost } from '@zod/sanitize/fetch';

/** Result of resolving an aggregator URL to its official event domain. */
export interface LinkHopResult {
  finalUrl: string;
  hops: number;
  ok: boolean;
}

/**
 * Resolve aggregator -> official domain within max 2 hops via HTTP redirect
 * following (D-04, D-05). Not browser rendering — native fetch with
 * redirect: 'manual' reads the Location header per hop.
 *
 * SSRF guard (Pitfall 6): every hop target is validated before following;
 * private/loopback targets fail immediately. Fails after 2 hops without an
 * official domain -> ok=false (tombstoned as link_hop_failed by caller, D-06).
 */
export async function resolveOfficialDomain(
  url: string,
  maxHops: number = 2,
): Promise<LinkHopResult> {
  let current = url;
  let hops = 0;

  for (;;) {
    let res: Response;
    try {
      res = (await globalThis.fetch(current, { redirect: 'manual' })) as Response;
    } catch {
      // fetch threw on this hop target -> private/loopback or invalid
      return { finalUrl: current, hops, ok: false };
    }
    if (!res) {
      return { finalUrl: current, hops, ok: false };
    }

    if (res.status >= 300 && res.status < 400) {
      if (hops >= maxHops) {
        return { finalUrl: current, hops, ok: false }; // link_hop_failed
      }
      const loc = res.headers.get('location');
      if (!loc) {
        return { finalUrl: current, hops, ok: false };
      }
      hops++; // count this redirect hop
      let next: string;
      try {
        next = new URL(loc, current).href;
      } catch {
        return { finalUrl: current, hops, ok: false };
      }
      // SSRF guard on the hop target before following
      try {
        validateUrl(next);
      } catch {
        return { finalUrl: current, hops, ok: false };
      }
      current = next;
      continue;
    }

    // Non-redirect response: this is the final URL
    return { finalUrl: current, hops, ok: isOfficialDomain(current) };
  }
}

/** Heuristic: treat a URL as an official event domain if it's public HTTPS. */
function isOfficialDomain(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !isPrivateHost(u.hostname);
  } catch {
    return false;
  }
}
