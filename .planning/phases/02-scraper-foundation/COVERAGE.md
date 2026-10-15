# Phase 2: Jina Reader API Coverage Matrix

**Created:** 2026-10-15
**Phase:** 02-scraper-foundation
**API:** Jina Reader (`https://r.jina.ai/<url>`)

## Detection

External API integration detected: **YES** — the Jina Reader HTTP API is the primary fetch path per D-01 (Jina-first strict). The API is integrated via `GET https://r.jina.ai/<url>` with `Authorization: Bearer $JINA_API_KEY` header.

## Capability Surface

| Capability | Disposition | Reason |
|------------|-------------|--------|
| Fetch markdown from URL | INTEGRATE | Core fetch path per D-01 — every URL goes to Jina first |
| Auth via Bearer key | INTEGRATE | D-06 keyed Jina — JINA_API_KEY in env, 500 RPM vs 20 RPM keyless |
| Rate-limit behavior (20 RPM keyless / 500 RPM keyed) | INTEGRATE | D-06 — keyed tier is mandatory at poll cadences; throttle triggers browser fallback per D-02 |
| X-Timeout header | INTEGRATE | D-07 — 30s per-fetch cap; X-Timeout: 25 is the server-side bound inside the client-side AbortSignal.timeout(30_000) |
| X-Retain-Links: all | INTEGRATE | D-04 — official/aggregator links must survive for 2-hop audit |
| X-Retain-Images: none | INTEGRATE | D-04 — images are token waste; stripped server-side |
| X-Remove-Selector | INTEGRATE | D-04 — aggressive server-side strip (nav, footer, .sidebar, #ads) before markdown reaches the pipeline |
| X-No-Cache | OPT-OUT | Only needed on re-audits/TBA re-pings (Phase 3+); first discovery accepts cached content (cheaper/faster) |
| x-respond-with: markdown+frontmatter | OPT-OUT | Using text/plain envelope (Title:/URL Source:/Markdown Content:) — simpler shape, frontmatter not needed in Phase 2 |
| x-preset bundles (agent/research/spider) | OPT-OUT | Explicit headers preferred over bundled presets — finer control over D-04 link/image/selector behavior |
| Crawl4AI self-hosted fallback | OPT-OUT | Only on evidence of persistent Jina 402/429 throttling; sanitize contract (URL in → capped markdown out) is unchanged so swap is a fetcher flip, never a pipeline rewrite |

## Integration Points

| Point | Location | Decision |
|-------|----------|----------|
| JINA_API_KEY env var | packages/config/src/env.ts | D-06 — required field, env.parse() fails without it |
| Authorization header | packages/sanitize/src/jina.ts | D-06 — Bearer scheme, never logged (pino redact) |
| Fail-signal routing | packages/sanitize/src/fetch.ts | D-02 — HTTP error / short body / throttle → browser fallback |
| Throttle cooling | packages/sanitize/src/fetch.ts | Pitfall 8 — park Jina path 60s on 402/429, route to browser during park |
| Rate-limit telemetry | packages/sanitize/src/jina.ts | Burn-gauge: log fallback cause (jina_http/jina_short/jina_throttle) for threshold tuning |

## Security Considerations

| Threat | Mitigation |
|--------|------------|
| JINA_API_KEY leakage in logs | pino REDACT_PATHS includes 'JINA_API_KEY' (packages/logger/src/index.ts) |
| SSRF via candidate URL | SSRF guard in fetch() facade before any fetch — Jina path benefits from Jina's own egress, but guard applies to both paths identically |
| Throttle-induced fallback stampede | Park-the-path cooling (60s in-memory) + p-limit(2) bound + scheduler noOverlap |
| Cache-poisoned stale content | X-No-Cache on re-fetches (Phase 3+); log cache warnings when present |

## Verification

| Behavior | Test | Command |
|----------|------|---------|
| Jina fetch returns markdown | fetch.test.ts | `pnpm vitest run packages/sanitize -- fetch` |
| Fail signals route to browser | fetch.test.ts | `pnpm vitest run packages/sanitize -- fetch` |
| SSRF guard rejects private URLs | fetch.test.ts | `pnpm vitest run packages/sanitize -- fetch` |
| JINA_API_KEY required at boot | env.test.ts | `pnpm vitest run packages/config` |
| JINA_API_KEY redacted in logs | redact test | `pnpm vitest run packages/logger` |
| Live Jina fetch (manual) | — | `pnpm vitest run packages/sanitize -- fetch --live` with JINA_API_KEY set |

---
*Phase: 2-Scraper Foundation*
*Coverage matrix: 2026-10-15*
