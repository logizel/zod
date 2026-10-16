---
phase: 05-jobs-loot-pipelines
plan: 09
subsystem: testing
tags: [vitest, unit-tests, gates, scheduler, discord-router, orchestrator, greenhouse]
requires:
  - phase: 05-01
    provides: tracer source files (gates/jobs.ts, orchestrator.ts, greenhouse.ts, scheduler registry/tick wiring)
  - phase: 05-08
    provides: D-14 extended Opportunity schema, channel env keys, resolveChannel env-ID-first
provides:
  - Unit + wiring test coverage for 05-01's tracer contracts
  - pickJobsBucket and evaluateJobsGates table-driven tests
  - Orchestrator drain limit, per-row isolation, tombstone, parse-failure tests
  - Scheduler JOB_POLL_JOBS/AUDIT_JOBS registration + guard tests
  - Candidate source injection + POLL_CANDIDATES suppression tests
  - Greenhouse adapter listing + detail fetch tests
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-08]
actuals:
  tokens: 16979
  tasks: 1
  commits: 3
tech-stack:
  added: []
  patterns: [TDD test coverage, table-driven tests, fakes/mocks for PB+router+cold, vitest global fetch stubbing]
key-files:
  created: [packages/discord-router/src/portals/jobs/greenhouse.test.ts]
  modified: [packages/orchestrator/src/gates/jobs.test.ts, packages/orchestrator/src/orchestrator.test.ts, packages/scheduler/src/registry.test.ts, packages/scheduler/src/poll-wiring.test.ts]
key-decisions:
  - "Tests only — no source changes (per plan constraint); tests written to match existing source behavior"
requirements-completed: [ING-03, JOB-04, JOB-05]
coverage:
  - id: D1
    description: gates/jobs.test.ts — pickJobsBucket table-driven tests + evaluateJobsGates verdict-driven decisions
    requirement: JOB-04, JOB-05
    verification:
      - kind: unit
        ref: packages/orchestrator/src/gates/jobs.test.ts#pickJobsBucket
        status: pass
      - kind: unit
        ref: packages/orchestrator/src/gates/jobs.test.ts#evaluateJobsGates
        status: pass
    human_judgment: false
  - id: D2
    description: orchestrator.test.ts — drain limit, per-row isolation, cold-store tombstone, parse failure
    requirement: ING-03, JOB-04, JOB-05
    verification:
      - kind: integration
        ref: packages/orchestrator/src/orchestrator.test.ts#drain limit and isolation
        status: pass
    human_judgment: false
  - id: D3
    description: scheduler registry.test.ts — JOB_POLL_JOBS/AUDIT_JOBS contents, portal-* entries, guard coverage
    requirement: ING-03
    verification:
      - kind: unit
        ref: packages/scheduler/src/registry.test.ts#job poll jobs registered via single registry
        status: pass
    human_judgment: false
  - id: D4
    description: scheduler poll-wiring.test.ts — candidateSource injection, POLL_CANDIDATES suppression, ats-json detail override
    requirement: ING-03
    verification:
      - kind: unit
        ref: packages/scheduler/src/poll-wiring.test.ts#candidate source injection
        status: pass
    human_judgment: false
  - id: D5
    description: greenhouse.test.ts — listing fixture, non-ok → [], fetchDetailText URL shapes + null fallback
    requirement: ING-03
    verification:
      - kind: unit
        ref: packages/discord-router/src/portals/jobs/greenhouse.test.ts
        status: pass
    human_judgment: false
---
# Phase 05 Plan 09: Jobs + Loot Pipelines — Unit + Wiring Test Coverage

**Unit + wiring test coverage for the 05-01 tracer's contracts: gates (pickJobsBucket bucket routing, evaluateJobsGates verdict decisions), orchestrator drain (limit enforcement, per-row isolation, tombstone paths), scheduler registry/tick wiring (candidateSource injection, POLL_CANDIDATES suppression with live deps), and the Greenhouse adapter (fixture parse, detail fetch fallback). All tests pass; no source changes.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-16T09:48:52Z
- **Completed:** 2026-10-16T09:55:00Z
- **Tasks:** 1 of 1
- **Files modified:** 5

## Accomplishments

- gates/jobs.test.ts: added pickJobsBucket table-driven tests (sys/cloud/devops/sre/k8s/kubernetes/rust/go/golang → sys/cloud bucket; frontend/data/unknown/empty → general bucket; whole-tag semantics so 'go' does not match 'google' or 'django') plus evaluateJobsGates coverage (admit passes through, reject reason_code verbatim)
- orchestrator.test.ts: added drain limit enforcement (getList called with bounded page size), per-row isolation (throwing router doesn't abort batch), cold-store tombstone write on reject, opportunity parse failure path (no partial row, verdict_parse_failed tombstone)
- scheduler registry.test.ts: added JOB_POLL_JOBS/AUDIT_JOBS exact name/expression/maxRandomDelayMs assertions, 7 portal-* staggered entries, assertSchedulerGuards coverage of all four tables
- scheduler poll-wiring.test.ts: added candidateSource injection (events + jobs sources), missing-source warning skip, POLL_CANDIDATES never processed with live deps, explicit candidates override, ats-json detail override + facade fallback, pipeline + candidate_title reach scratchpad writer
- greenhouse.test.ts (NEW): listing fixture → PollCandidate[] with url/title/snippet ≤200 chars, non-ok → [], fetchDetailText both URL shapes + null fallback
- Full suite: 507 tests pass across 57 files; workspace TypeScript build clean; zero live network IO in any test

## Task Commits

Each task was committed atomically:

1. **Task 1: Unit + wiring coverage for gates, registry tables, tick sources, and Greenhouse adapter** - `28aadbf` (test)

## Files Created/Modified

- `packages/discord-router/src/portals/jobs/greenhouse.test.ts` - NEW — Greenhouse adapter listing + detail fetch tests
- `packages/orchestrator/src/gates/jobs.test.ts` - pickJobsBucket + evaluateJobsGates tests
- `packages/orchestrator/src/orchestrator.test.ts` - drain limit, isolation, tombstone, parse failure tests
- `packages/scheduler/src/registry.test.ts` - JOB_POLL_JOBS/AUDIT_JOBS + guard tests
- `packages/scheduler/src/poll-wiring.test.ts` - candidateSource injection + suppression tests

## Decisions Made

None - followed plan as specified. Tests written to match existing source behavior (no source changes per plan constraint).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tests pass against existing source; TypeScript build clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All 05-01 tracer contracts are pinned by unit tests. Later plans (05-02..05-08) can expand horizontally without silently breaking the tracer's guarantees.

## Self-Check: PASSED

All created files exist on disk. Both commits (28aadbf task commit, b2a3cbd docs commit) are in the repository.

---
*Phase: 05-jobs-loot-pipelines*
*Completed: 2026-10-16*
