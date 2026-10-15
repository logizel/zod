---
phase: 02-scraper-foundation
plan: 03
subsystem: integration
tags: [scheduler, soak, byte-proof, integration]
requires:
  - phase: 02-scraper-foundation
    plan: 02
    provides: scout, browser queue, fetch facade, scratchpad resilience
provides:
  - Scheduler poll wiring (POLL_CANDIDATES + runPollTick body)
  - 24h browser soak drill harness (--local mini-soak)
  - Live byte-proof mode (LIVE_BYTEPROOF=1)
affects: [scheduler, audit flow, scraper pipelines]
tech-stack:
  added: []
  patterns:
    - "runPollTick: dedup -> scout -> scratchpad -> fetch -> STEP_2"
key-files:
  created:
    - infra/oracle/drills/browser-soak.sh
  modified:
    - packages/scheduler/src/jobs.ts
    - packages/sanitize/src/byteproof.test.ts
decisions:
  - "Poll dependencies are injected via TickOptions (pb/hot/cold/fetch/candidates); registry contract unchanged"
  - "Soak zombie detection filters chrome-headless-shell to avoid unrelated browser processes"
metrics:
  duration: integration
  completed: 2026-10-15
  tasks: 3
  files: 7
actuals:
  tokens: 4200
  tasks: 3
  commits: 3
  plan_head_before: d9ec97dd0a73b6900be42976a8581018e091c70f
  plan_head_after: dee5e348f8c60ccffe9dea984297993266d466e6
status: complete
---

# Phase 2 Plan 03: Integration Summary

**Wired the scheduler poll pipeline, added the 24h browser soak drill, and verified the full phase suite green.**

## Performance

- **Tasks:** 3
- **Tests:** 104 passing (full suite); soak PASS
- **Build:** `pnpm build` clean

## Accomplishments

- `runStubTick` (exported alias `runPollTick`) now processes `POLL_CANDIDATES` in the tracer-proven order: dedup `precheck()` → scout `prefilter()` → scratchpad `resumeByUrl()` → `fetch()` → `advanceToStep2()` (with `recordFailure()` on failure).
- Added `infra/oracle/drills/browser-soak.sh`: 5-minute mini-soak (`--local`) and 24h mode, measuring RSS and zombies, enforcing success rate ≥95%, max RSS <1.5GB, zero zombies, flat RSS trend.
- Enhanced `byteproof.test.ts` with `LIVE_BYTEPROOF=1` mode fetching representative URLs through the browser path; default fixture mode unchanged.
- Full suite green: `pnpm build && pnpm test` (104 tests, no Phase 1 regressions); subset suites for config/logger, db-hot, dedup/db-cold, scheduler all green.

## Byte-proof results (default fixture)

- page 1: raw=7047 bytes, capped=622 bytes, ratio=0.0883 (≤15%)
- page 2 (media heavy): raw=8321 bytes, capped=1174 bytes, ratio=0.1411 (≤15%)

## Browser soak results (--local)

- total=10 fetches, success=10, successRate=1.0
- max RSS=348.1 MB (<1.5 GB)
- zombies=0
- RSS trend flat (not rising)

## Deviations from Plan

None - plan executed as written. Note: the soak script's zombie detector was refined to count `chrome-headless-shell` processes only, avoiding unrelated VS Code/Discord crashpad handlers on the dev host.

### Auto-fixed Issues

None.

## Known Stubs

None.

## Self-Check: PASSED

- All task commits present (3fd586f, 5fa4325, dee5e34).
- `pnpm build && pnpm test` succeeded before final commit.
