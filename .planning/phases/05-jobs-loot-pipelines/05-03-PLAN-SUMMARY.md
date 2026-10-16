---
phase: 05-jobs-loot-pipelines
plan: 03
subsystem: jobs
tags:
  - d-04
  - d-05
  - d-06
  - d-07
  - d-08
  - job-01
  - job-02
  - job-03
  - job-04
  - job-05
  - senior-screen
  - fresher-gate
  - scam-detector
  - geo-gate
  - fellowship-allowlist
  - admission-class
  - tdd
dependency_graph:
  requires: [05-01]
  provides: [05-04, 05-05]
  affects:
    - packages/scout
    - packages/scheduler
    - packages/orchestrator
    - packages/config
tech_stack:
  added: []
  patterns:
    - pure zero-fetch predicates with zod boundary validation
    - table-driven vitest tests
    - enum-typed reason codes (scam_*, geo_*, experience_min_2plus, unpaid_non_fellowship)
    - parameter-injected allowlists (config default + FELLOWSHIP_ALLOWLIST_EXTRA env)
key_files:
  created:
    - packages/scout/src/jobs-screen.ts
    - packages/scout/src/jobs-screen.test.ts
    - packages/scheduler/src/screen-wiring.test.ts
    - packages/config/src/jobs-policy.ts
    - packages/config/src/jobs-policy.test.ts
    - packages/orchestrator/src/gates/jobs.test.ts
    - packages/orchestrator/src/rule-packs/jobs.test.ts
  modified:
    - packages/scout/package.json
    - packages/scheduler/src/jobs.ts
    - packages/scheduler/vitest.config.ts
    - packages/config/package.json
    - packages/config/src/env.ts
    - .env.example
    - packages/orchestrator/src/gates/jobs.ts
    - packages/orchestrator/src/rule-packs/jobs.ts
    - packages/orchestrator/vitest.config.ts
    - packages/discord-router/src/router-service.test.ts
decisions:
  - Stored DEFAULT_FELLOWSHIP_ALLOWLIST in @zod/config (cycle-free: scheduler never imports orchestrator) with operator extension via FELLOWSHIP_ALLOWLIST_EXTRA env, fail-closed on unknown programs (T-05-18 mitigation)
  - evaluateJobsGates keeps final reject authority over LLM verdicts; deterministic predicates (experience, scam, geo) re-parse from fetched text rather than trusting LLM fields (T-05-14 mitigation)
  - D-04 senior screen uses whole-word case-insensitive title regex so 'Leadership'/'Managerial' don't match while 'Team Lead'/'Engineering Manager' do (Pitfall 9: seniority false PASS/REJECT)
  - Listing-stage scam/geo detectors are flag-only (telemetry), never auto-reject — auditor confirms from full text (T-05-16, T-05-17 mitigations)
metrics:
  duration_min: 17
  completed_date: "2026-10-16T09:13:34Z"
status: complete
actuals:
  tokens: 25015
  tasks: 2
  commits: 2
plan_head_before: 0e02637929e10b149bf0331a4f5485e9b33e8d24
plan_head_after: c0354d5ca92cf68fc3fb78df3cc15f4e0df8982d
---

# Phase 05 Plan 03: D-04 Senior Screen + D-05..D-08 Gates + JOB-02 Admission-Class Rule Pack

**One-liner:** Zero-fetch D-04 senior listing screen with flag-only scam/geo pre-detectors, full D-05..D-08 fresher/scam/geo deterministic gates, and JOB-02 admission-class rule pack — all pure, table-tested, and committed across @zod/scout, @zod/scheduler, @zod/orchestrator, and @zod/config.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | D-04 listing screen in @zod/scout + scheduler wiring (zero-fetch senior reject, flag-only pre-detectors) | 403f7af | packages/scout/src/jobs-screen.ts, packages/scout/src/jobs-screen.test.ts, packages/scout/package.json, packages/scheduler/src/jobs.ts, packages/scheduler/src/screen-wiring.test.ts, packages/scheduler/vitest.config.ts |
| 2 | Full D-05..D-08 gates + JOB-02 admission-class rule pack | c0354d5 | packages/config/src/jobs-policy.ts, packages/config/src/jobs-policy.test.ts, packages/config/package.json, packages/config/src/env.ts, .env.example, packages/orchestrator/src/gates/jobs.ts, packages/orchestrator/src/gates/jobs.test.ts, packages/orchestrator/src/rule-packs/jobs.ts, packages/orchestrator/src/rule-packs/jobs.test.ts, packages/orchestrator/vitest.config.ts, packages/discord-router/src/router-service.test.ts |

## Verification Results

- `pnpm vitest run packages/scout packages/scheduler` — 82 tests across 8 files, all green (56 scout + 26 scheduler including 5 new screen-wiring tests)
- `pnpm vitest run packages/orchestrator packages/config` — 80 tests across 5 files, all green (69 new: 11 jobs-policy + 46 gates + 12 rule-packs)
- `pnpm build` — `tsc -b` clean, zero errors
- `pnpm vitest run packages/orchestrator/src/e2e-tracer.test.ts` — 5/5 green, 05-01 gate contract preserved unchanged
- Info-level greps: no `@zod/orchestrator` import under `packages/scout/src` or `packages/scheduler/src`; no `fetch`/network call inside `jobs-screen.ts` (only in comments)

## Deviations from Plan

**1. Build fix — new required env key in test literal (Rule 3 - blocking issue)**
- **Found during:** `pnpm build` after Task 2 implementation
- **Issue:** Adding `FELLOWSHIP_ALLOWLIST_EXTRA: z.string().default('')` to `EnvSchema` made it a required property on the `Env` type, causing a TS2741 compile error in `packages/discord-router/src/router-service.test.ts` which constructs a plain `Env` object literal without the new key.
- **Fix:** Added `FELLOWSHIP_ALLOWLIST_EXTRA: ''` to the `testEnv` literal in `packages/discord-router/src/router-service.test.ts`.
- **Files modified:** `packages/discord-router/src/router-service.test.ts`
- **Commit:** c0354d5 (included in Task 2 commit)

None other — plan executed exactly as written otherwise.

## Known Stubs

None — all functions are fully implemented with real logic; no placeholder returns, hardcoded empty values, or TODO/FIXME markers in any created or modified file.

## Threat Surface Scan

All new security-relevant surface was already covered in the plan's `<threat_model>` (T-05-14 through T-05-18, T-05-SC). No new endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced beyond those mitigations. No `threat_flag` entries required.

## Auth Gates

None — no authentication was required during execution.
