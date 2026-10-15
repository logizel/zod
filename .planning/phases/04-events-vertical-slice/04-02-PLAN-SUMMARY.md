# Phase 4 Plan 02 Summary — Portal Adapters + Staggered Cron

**Phase:** 04 (Events Vertical Slice)  
**Plan:** 02  
**Wave:** 2  
**Status:** Complete  
**Commit:** bcf4cb1

## What Was Built

Expanded the tracer's single CTFtime adapter to all 7 national portals (D-01) and registered 7 staggered portal-poll cron jobs through the single scheduler registry (D-02). Each adapter emits title+snippet from its listing (RSS/JSON first) with Scout pre-filter on the listing (zero fetch).

### New Portal Adapters (6 files + 6 test files)

| File | Mode | Source | Status |
|------|------|--------|--------|
| `src/portals/ctftime.ts` | API | ctftime.org/api/v1/events/ | Plan 01 |
| `src/portals/clist.ts` | API | clist.by/api/v1/json/event/ | New |
| `src/portals/unstop.ts` | Scrape | unstop.com/competitions | New |
| `src/portals/devfolio.ts` | Scrape | devfolio.co/hackathons | New |
| `src/portals/devpost.ts` | Scrape | devpost.com/hackathons | New |
| `src/portals/luma.ts` | Scrape | lu.ma/events | New |
| `src/portals/meetup.ts` | Scrape | meetup.com/find | New |

Each adapter exports `list(opts?: { since?: Date }): Promise<PollCandidate[]>` emitting only `url + title + snippet` (no markdown, no full fetch, no `description_raw`).

### Scheduler Changes (jobs.ts)

- **STUB_JOBS**: Added 7 portal-poll entries (`portal-ctftime`, `portal-clist`, `portal-unstop`, `portal-devfolio`, `portal-devpost`, `portal-luma`, `portal-meetup`) with staggered cron expressions across the 15–30m window with 5-minute offsets in Asia/Kolkata timezone, `noOverlap: true`, `maxRandomDelayMs: 5 * 60_000` jitter
- **PORTAL_LIST_FNS**: Exported array of all 7 adapter `list` functions
- **getPortalCandidates()**: Merges candidates from all 7 adapters, deduplicated by URL
- **POLL_CANDIDATES**: Kept as static stub for backward compatibility

### Modified Files

| File | Change |
|------|--------|
| `packages/scheduler/package.json` | Added `@zod/discord-router` dependency |
| `packages/scheduler/tsconfig.json` | Added `../discord-router` reference |
| `packages/scheduler/vitest.config.ts` | Added portal adapter aliases + `DISCORD_TOKEN` env |
| `packages/discord-router/package.json` | Added `cheerio`, `@zod/browser` deps; `./portals/*` subpath export |
| `packages/discord-router/vitest.config.ts` | Added portal adapter aliases |
| `packages/discord-router/src/portals/ctftime.ts` | Export `PollCandidate` interface |
| `packages/sanitize/package.json` | Added `./fetch` subpath export |
| `packages/sanitize/src/fetch.ts` | Export `validateUrl` (was module-private) |
| `packages/config/src/env.ts` | `DISCORD_TOKEN` already added (Plan 01) |
| `packages/config/src/env.test.ts` | Added `DISCORD_TOKEN` to test REQUIRED |
| `packages/config/vitest.config.ts` | Added `DISCORD_TOKEN` test env |
| All other package vitest configs | Added `DISCORD_TOKEN` + `SAMBANOVA_API_KEY` test env |

### Test Results

- `pnpm vitest run packages/discord-router` — 36/36 tests green (11 files)
- `pnpm vitest run packages/scheduler` — 21/21 tests green (3 files)
- `pnpm test` (full suite) — 207/207 tests green (33 files)
- `pnpm build` (full workspace) — zero errors

### Locked Decisions Honored

- **D-01:** All 7 national portals wired with dedicated parsers (CTFtime from Plan 01 + 6 from this plan)
- **D-02:** 7 portals' polls staggered across 15–30m window (5-min offsets), avoiding thundering-herd
- **D-03:** Each adapter emits title+snippet from listing first; Scout pre-filter runs on listing (zero fetch)

### Threat Mitigations

- T-04-07: Staggered cron offsets + `noOverlap: true` + maxRandomDelayMs jitter prevent tick stampede
- T-04-08: Scrape-mode only for 5 portals without free APIs; api-mode for CTFtime + CLIST.by

### Next (Wave 3 — Plan 03)

Live Discord gateway login + channel resolution + router service poll loop (audited→routed) + router-service tests + .env.example DISCORD_TOKEN placeholder.
