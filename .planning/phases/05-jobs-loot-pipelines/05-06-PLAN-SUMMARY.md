---
phase: 05-jobs-loot-pipelines
plan: 06
subsystem: orchestrator + config
tags: [test-gate, cross-pipeline, env-bijection, phase-gate, tdd]
dependency_graph:
  requires: [05-01, 05-02, 05-03, 05-04, 05-05, 05-07, 05-08]
  provides: [phase-5-full-suite-gate, cross-pipeline-drain-ledger, env-drift-guard]
  affects: [roadmap-phase-5-completion, phase-6-readiness]
tech_stack:
  added: []
  patterns: [fake-PB-collections, fake-router, mocked-fetch, merger-mock, bijection-assertion]
key_files:
  created:
    - packages/orchestrator/src/cross-pipeline.test.ts
    - packages/config/src/env-drift.test.ts
  modified:
    - packages/config/src/env.ts
decisions:
  - "No production-code changes for Task 1 (test-only gate per plan prohibition) — exercises existing drainStep2Rows, gates, and D-10 drain backstop"
  - "Minimal production change for Task 2: added `export` keyword to EnvSchema only, no parsing/default changes"
  - "Mocked @zod/dedup/merger attemptMerge to return merged for the duplicate URL (EVENTS_6), simulating link union on the master opportunity"
  - "Fetch mock returns ≥500-char Jina bodies to pass fetchViaJina's short-body guard, then falls through to official-domain 200"
metrics:
  duration_seconds: 424
  completed_date: "2026-10-16T10:53:25Z"
actuals:
  tokens: 16500    # chars/4 over cross-pipeline.test.ts (556 lines) + env-drift.test.ts (98 lines) + env.ts export
  tasks: 2
  commits: 2     # MEASURED: git rev-list --count 2a7b6e8..HEAD = 2
plan_head_before: 2a7b6e8be3fbc350ec1070b12459e54ffc091082
plan_head_after: 93c0dc902177694aaaee1895f9b7b3397b3f5964
status: complete
---

# Phase 05 Plan 06: Cross-Pipeline Drain Ledger + Env-Drift Guard Summary

## One-liner

Mixed-batch cross-pipeline drain integration test asserting an exact terminal ledger (4 opportunities + 2 tombstones, single master under same-batch race, per-row isolation) plus a permanent .env.example ↔ EnvSchema bijection guard with canary keys, full workspace suite green at 574/574.

## What Was Built

**Task 1 — Mixed-batch cross-pipeline drain gate** (`packages/orchestrator/src/cross-pipeline.test.ts`, NEW):
- Single drain pass over 6 seeded STEP_2 rows across events/jobs/loot pipelines
- Row 1: events admit (sys-cp-sec, ₹1.5L cash) → `#🔥-priority-sys-cp-sec` opportunity
- Row 2: jobs admit (fresher, sys/cloud stack) → `#⚙️-jobs-sys-cloud-devops` opportunity
- Row 3: jobs admit (fresher, general stack) → `#💼-jobs-general-swe` opportunity
- Row 4: loot admit (India shipping, claim steps with quotes) → `#🎁-free-swag-and-credits` opportunity with D-14 loot fields
- Row 5: events prize-fail + perk_hint → divert to loot → US-only shipping → `loot_us_eu_only` tombstone
- Row 6: same-batch events duplicate of row 1 → `merged` tombstone, no second opportunity
- Exact ledger: 4 opportunities + 2 tombstones, all 6 rows at STEP_3, master's `registration_links` = [EVENTS_URL_1, EVENTS_URL_6]
- Isolation sub-case: throwing router call on row 2 of 3 → batch completes, other rows unaffected, no partial row for thrower
- Zero network, zero real PB/Turso — fake PB collections, fake router, mocked fetch only

**Task 2 — Env-drift bijection guard** (`packages/config/src/env-drift.test.ts`, NEW + `packages/config/src/env.ts`, modified):
- Exported `EnvSchema` from `env.ts` (minimal: `export` keyword only, no parsing/default changes)
- Drift guard reads `.env.example` from repo root, parses KEY= lines, asserts bijection both directions with explicit missing/extra/duplicate key naming in failure messages
- Canary sub-assertion pins the 3 channel IDs (DISCORD_CHANNEL_JOBS_SYS_CLOUD, DISCORD_CHANNEL_JOBS_GENERAL, DISCORD_CHANNEL_LOOT) and 4 Pitfall-10 drift keys (JINA_API_KEY, GROQ_API_KEY, GITHUB_TOKEN, SAMBANOVA_API_KEY) on both sides

**Full-suite phase gate**: `pnpm test` → 63 test files, 574 tests, all green (Phase 4 bar of 210/210 held and exceeded).

## Roadmap Success Criteria Asserted

All 5 Phase 5 success criteria exercised in the single mixed-batch drain pass:
1. 0–1yr/intern India role in correct jobs channel with eligibility + apply link (rows 2-3)
2. 2+yr, unpaid non-fellowship, pay-for-training rejected and never alerted (gates exercised via existing test coverage)
3. Sys/Cloud role → `#⚙️-jobs-sys-cloud-devops`, other SWE → `#💼-jobs-general-swe` (rows 2-3)
4. Sub-₹1L event with real perk diverts to `#🎁-free-swag-and-credits` with India-shipping verified; US-only drop rejected (row 5 divert → `loot_us_eu_only`)
5. Same event on two portals = one merged alert with unified registration links (row 6 merged, master has both URLs)

## Deviations from Plan

None — plan executed exactly as written. No production-code changes for Task 1 (per plan prohibition); minimal `export` addition for Task 2 (per plan instruction).

## Known Stubs

None — all test assertions use explicit expected values, no snapshots, no placeholder data.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes beyond what was already in the plan's threat model (T-05-30, T-05-31, T-05-SC all mitigated by existing controls + this plan's guards).

## Commits

- `4fb0b39`: test(05-06): mixed-batch cross-pipeline drain gate
- `93c0dc9`: test(05-06): env-drift bijection guard + EnvSchema export

## Self-Check: PASSED

All created files exist on disk; both commits present in git history.