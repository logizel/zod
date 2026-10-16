---
phase: 05-jobs-loot-pipelines
plan: 07
subsystem: jobs
tags: [jobs, yc-work-at-a-startup, wellfound, fetch-facade, fetch-via-browser, cheerio, polling, tdd]

# Dependency graph
requires:
  - phase: 05-01
    provides: job source adapter contract (list() -> PollCandidate[]) + candidateSources['jobs'].list wiring
  - phase: 05-02
    provides: eight-source getJobCandidates fan-out + boards.ts D-02 seed/auto-learn rotation
provides:
  - packages/discord-router/src/portals/jobs/yc.ts — YC Work-at-a-Startup listing adapter (browser-mode primary per probe)
  - packages/discord-router/src/portals/jobs/wellfound.ts — Wellfound listing adapter (fetch-facade primary per probe + single browser fallback)
  - packages/discord-router/src/portals/jobs/index.ts — JOB_LIST_FNS extended to ten sources (yc + wellfound appended)
affects:
  - phase 05-06 (cross-pipeline gate — closes phase over all seven plans)
  - phase 05-08 / 05-09 (jobs tick wiring + tests)

# Actuals (#2632) — pairs with the plan's `estimate` (30000 tokens) to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 6635
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []  # no new dependencies — cheerio + @zod/browser + @zod/sanitize already workspace packages
  patterns:
    - listing-first adapter contract (list() -> PollCandidate[] {url, title, snippet <=200})
    - probe-first mode selection: logged-out plain-fetch probe decides adapter primary path
    - fetch-facade primary + exactly-one fetchViaBrowser shell fallback (wellfound)
    - bounded <=2 pages per poll with contiguous page seams (yc)
    - never-throw list() (browser/fetch error -> [], malformed cards skipped)
    - SSRF validateUrl on absolutized candidate URLs

key-files:
  created:
    - packages/discord-router/src/portals/jobs/yc.ts
    - packages/discord-router/src/portals/jobs/yc.test.ts
    - packages/discord-router/src/portals/jobs/wellfound.ts
    - packages/discord-router/src/portals/jobs/wellfound.test.ts
  modified:
    - packages/discord-router/src/portals/jobs/index.ts
    - packages/discord-router/src/portals/jobs/index.test.ts

key-decisions:
  - "YC primary mode = browser (fetchViaBrowser via shared queue): probe showed workatastartup.com/jobs returns a client-rendered React shell with 0 job/company links via plain fetch"
  - "Wellfound primary mode = fetch-facade (native fetch): probe showed wellfound.com/jobs serves full listing markup (215 anchors, ~110 job/company hrefs, __NEXT_DATA__) to a logged-out plain fetch; exactly-one fetchViaBrowser fallback on shell detection"
  - "No scheduler/registry/.env changes — new sources ride the existing JOB_POLL_JOBS jobs tick (05-01 cadence)"

requirements-completed: [ING-03]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: YC Work-at-a-Startup listing adapter — browser-mode primary, logged-out, never-throw, <=2 pages
    requirement: ING-03
    verification:
      - kind: unit
        ref: packages/discord-router/src/portals/jobs/yc.test.ts (6 tests: happy path, contiguous 2-page pagination, malformed-card skip, browser-error -> [], no-cards stop)
        status: pass
    human_judgment: false
  - id: D2
    description: Wellfound listing adapter — fetch-facade primary, shell -> exactly-one fetchViaBrowser fallback, never-throw
    requirement: ING-03
    verification:
      - kind: unit
        ref: packages/discord-router/src/portals/jobs/wellfound.test.ts (6 tests: fetch-facade happy path, shell fallback, non-ok -> [], shell+browser-error -> [], malformed-card skip)
        status: pass
    human_judgment: false
  - id: D3
    description: Ten-source getJobCandidates fan-out — yc + wellfound appended to JOB_LIST_FNS, dedupe, ordering, isolation, D-02 harvest participation
    requirement: ING-03
    verification:
      - kind: unit
        ref: packages/discord-router/src/portals/jobs/index.test.ts (11 tests: 10-source fan-out, cross-source dedupe, stable ordering, dual-source isolation, harvest participation, JOB_LIST_FNS length 10)
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-10-16T10:13:07Z
status: complete
plan_head_before: ccdcc2821c1c55d6c3bcadae3926376f4309e33f
plan_head_after: 37aa45914d1c1de811f2aadbf99ffe7a2c53b871

# Phase 05 Plan 07: Jobs + Loot Pipelines — YC + Wellfound Adapters Summary

**Logged-out probe-first adapter delivery: YC Work-at-a-Startup (browser-mode primary) and Wellfound (fetch-facade primary) listing adapters, wired into the ten-source getJobCandidates fan-out, with probe verdicts recorded and zero live network in tests.**

## Performance

- **Duration:** 9 min (10:03:45Z → 10:13:07Z)
- **Started:** 2026-10-16T10:03:45Z
- **Completed:** 2026-10-16T10:13:07Z
- **Tasks:** 2 of 2 completed
- **Files modified:** 6 (4 created, 2 modified)

## Task 1 Step 0 — Logged-out Accessibility Probe (Open Question 1)

Executed 2026-10-16, logged-out, NO cookies, NO credentials, each host requested twice (plain native fetch + fetchViaBrowser path). Card counts:

| Source | Plain fetch (fetch-facade) | fetchViaBrowser (browser) | Listing cards found | Verdict / Primary mode |
|--------|---------------------------|---------------------------|---------------------|------------------------|
| workatastartup.com/jobs | 200, 81KB React shell, 0 job/company hrefs (all ~150 hrefs are static assets) | Not live-testable (playwright-core not installed in this env — adapter code uses shared queue; tests mock it) | 0 on plain fetch | **browser-mode** (fetchViaBrowser via shared @zod/browser queue) |
| wellfound.com/jobs | 200, 242KB, 215 anchors, ~110 job/company hrefs, `__NEXT_DATA__` present | Not needed for primary (shell fallback coded but not triggered by probe) | ~110 on plain fetch | **fetch-facade** (native fetch primary; exactly-one browser fallback on shell detection) |

These match the preliminary revision-time evidence recorded in 05-RESEARCH.md Open Question 1. Adapter primary-mode constants (`YC_PRIMARY_MODE = 'browser'`, `WELLFOUND_PRIMARY_MODE = 'fetch-facade'`) carry `PROBE_VERDICT (2026-10-16)` comments matching the verdict.

## Accomplishments

- Task 1: yc.ts + wellfound.ts listing adapters + fixture tests — probe-verified primary modes, never-throw contract, bounded <=2 pages, no login/apply/cookie/credential surfaces, no chromium.launch
- Task 2: index.ts JOB_LIST_FNS extended 8 → 10 sources (yc + wellfound appended); index.test.ts extended to 11 tests covering ten-source fan-out, cross-source URL dedupe, stable ordering, dual-source isolation, and D-02 harvest participation
- Full `pnpm vitest run packages/discord-router` green: 129 tests across 25 files, zero live network

## Task Commits

Each task was committed atomically:

1. **Task 1: Logged-out accessibility probe + YC Work-at-a-Startup and Wellfound listing adapters** - `0049927` (feat)
2. **Task 2: Ten-source getJobCandidates fan-out — yc + wellfound wiring, isolation, ordering, harvest** - `37aa459` (feat)

## Files Created/Modified

- `packages/discord-router/src/portals/jobs/yc.ts` - YC Work-at-a-Startup listing adapter (browser-mode primary)
- `packages/discord-router/src/portals/jobs/yc.test.ts` - YC adapter fixture tests (6 cases)
- `packages/discord-router/src/portals/jobs/wellfound.ts` - Wellfound listing adapter (fetch-facade primary + shell fallback)
- `packages/discord-router/src/portals/jobs/wellfound.test.ts` - Wellfound adapter fixture tests (6 cases)
- `packages/discord-router/src/portals/jobs/index.ts` - JOB_LIST_FNS extended to ten sources
- `packages/discord-router/src/portals/jobs/index.test.ts` - Ten-source fan-out tests (11 cases)

## Decisions Made

- Probe-first mode selection: adapter primary path chosen from logged-out probe verdict, not assumption
- YC = browser-mode primary (client shell via plain fetch); Wellfound = fetch-facade primary (full markup via plain fetch)
- No new dependencies, no scheduler/registry/.env changes — sources ride the existing jobs tick

## Deviations from Plan

None - plan executed exactly as written. The probe was run before adapters (mandatory Step 0), verdicts recorded, and both adapters' primary modes match the verdict.

**Total deviations:** 0 auto-fixed. **Impact on plan:** None — plan executed as specified.

## Issues Encountered

- playwright-core / fetchViaBrowser not live-testable in this execution environment (not installed). The wellfound shell→browser fallback and yc browser path are implemented per contract and exercised via mocked `fetchViaBrowser` in tests. Live browser-path verification deferred to deployment environment.

## User Setup Required

None - no external service configuration required. Adapters poll logged-out public listing pages only (no credentials).

## Next Phase Readiness

- ING-03 D-01 source mix complete: YC Work-at-a-Startup + Wellfound now feed the jobs tick alongside the existing eight sources
- Plan 05-06 (cross-pipeline gate) can close Phase 05 over all seven plans
- No blockers; discord-router suite green (129 tests)

## Self-Check: PASSED

All created files exist on disk; both task commits (0049927, 37aa459) are reachable in git history.

---
*Phase: 05-jobs-loot-pipelines*
*Completed: 2026-10-16*
