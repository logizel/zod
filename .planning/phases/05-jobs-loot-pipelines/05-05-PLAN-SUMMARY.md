---
phase: 05-jobs-loot-pipelines
plan: 05
subsystem: dedup
tags: [evf-07, dedup, merger, scheduler, orchestrator, discord-router]
dependency_graph:
  requires: [05-01, 05-03, 05-04]
  provides: [05-06, 05-07]
  affects: [packages/dedup, packages/scheduler, packages/orchestrator, packages/discord-router]
tech_stack:
  added: [string-similarity-js@2.1.4]
  patterns: [structural-port, discriminated-result, bounded-candidate-query, pre-audit-stage, drain-backstop]
key_files:
  created:
    - packages/dedup/src/merger.ts
    - packages/dedup/src/merger.test.ts
    - packages/scheduler/src/scheduler-merger.test.ts
  modified:
    - packages/dedup/package.json
    - pnpm-lock.yaml
    - packages/scheduler/src/jobs.ts
    - packages/scheduler/vitest.config.ts
    - packages/orchestrator/src/orchestrator.ts
    - packages/orchestrator/src/orchestrator.test.ts
    - packages/orchestrator/package.json
    - packages/orchestrator/vitest.config.ts
    - packages/discord-router/src/embed.ts
    - packages/discord-router/src/embed.test.ts
    - tsconfig.base.json
decisions:
  - "string-similarity-js@2.1.4 selected over deprecated string-similarity and fastest-levenshtein per 05-RESEARCH.md Package Legitimacy Audit (OK verdict)"
  - "MergeStore port kept structural in @zod/dedup — no db-hot/db-cold import; createMergeStore wires PB/cold at scheduler/orchestrator layer"
  - "Intake merge runs only on precheck 'fresh' verdicts (Pitfall 9: hot-hit/tombstoned bypass)"
  - "extractCompany used for company-in-title sources when organizer not provided (HN/aggregator convention)"
  - "Jobs pipeline requires location match on both sides under same both-present/≥0.8 evidence rule"
  - "Recent-created fallback (±3d of now) used when input dateMs is absent"
metrics:
  duration_minutes: ~75
  completed_date: "2026-10-16"
actuals:
  tokens: 15000
  tasks: 2
  commits: 2
plan_head_before: "28aadbf2fdd7e2858b44a558a96f7697c1300518"
plan_head_after: "2f053450336cf8d543989d1f0253cc64587dd15f"
status: complete
---

# Phase 05 Plan 05: EVT-07 Cross-Portal Duplicate Merger — Summary

## One-liner

Bounded fuzzy duplicate merger (EVT-07) with pre-audit intake stage, drain backstop, and deduplicated link-union card — same event seen on two portals arrives as one merged alert with unified registration links.

## What Was Built

### Task 1: Merger core (`packages/dedup/src/merger.ts`)
- **`MERGE_THRESHOLD = 0.9`**, **`MERGE_FLAG_THRESHOLD = 0.7`** — D-09 locked initial values
- **`normalizeTitle()`** — lowercase, 4-digit year strip, non-alphanumeric strip, whitespace collapse, trim (mirrors 05-RESEARCH.md Code Example)
- **`extractCompany()`** — leading segment before `|`, `—`, or ` - ` when ≥2 segments and ≤40 chars; null otherwise
- **`attemptMerge()`** — full D-09 merge gate: title Dice ≥0.9 AND organizer/company evidence (both-present equality or ≥0.8) AND ±3-day window (inclusive, master date falls back to created_at; recent-created fallback when dateMs absent). Jobs additionally requires location match. Result union: `{merged, masterId, links}` | `{merged: false, possibleDupe: true, masterId?}` | `{merged: false, possibleDupe: false}`
- **`MergeStore`** structural port (no db-hot/db-cold import in dedup) + **`createMergeStore()`** for PB/cold wiring
- Bounded `findCandidates` (same pipeline, ±3d window, limit 50 — never full scan); `tombstoneMerged('merged', 'merger')` once per merge; `appendLinks` for deduplicated link union
- Scope guard: no merge for loot pipeline (D-11)

### Task 2: Wire the merger
- **`packages/scheduler/src/jobs.ts`** — intake merge stage inserted between precheck 'fresh' and scout prefilter (D-10); runs only on 'fresh' verdicts; merged → skip fetch/audit/scratchpad; possibleDupe → proceed with log; hot-hit bypasses; missing pb → skip gracefully. `PollCandidate` extended with `organizer` and `dateMs`.
- **`packages/orchestrator/src/orchestrator.ts`** — drain backstop before `createOpportunityIfAbsent` for events + jobs admits; merged → `writeTombstone('merged', 'merger')` + advanceToStep3 (no create); possibleDupe → `possible_dupe_of` written on created row
- **`packages/discord-router/src/embed.ts`** — Links field renders deduplicated registration_links union in stable sorted order; >1 link renders all `[Reg N]` entries

### Tests (all TDD RED→GREEN→REFACTOR)
- `merger.test.ts` — 37 tests: thresholds, normalization, extractCompany, merge/possibleDupe/plain matrix, ±3d boundary, jobs location gate, store bounds, scope guard, createMergeStore PB-fake
- `scheduler-merger.test.ts` — 5 tests: merged (zero fetch, store writes), non-dupe (full pipeline), possibleDupe (proceeds), hot-hit (attemptMerge never called), missing pb (graceful skip)
- `orchestrator.test.ts` — 2 backstop additions: merged at drain (no create, tombstone, STEP_3), possibleDupe (possible_dupe_of on create)
- `embed.test.ts` — 2 new cases: dedup of duplicate links, stable sorted order

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met:

- ✅ string-similarity-js@2.1.4 installed via pnpm (lockfile updated); no other new dependency
- ✅ attemptMerge result union and merge gate match D-09 policy, pinned by boundary tests
- ✅ MergeStore port is structural (no db-hot/db-cold import in dedup); createMergeStore covered by PB-fake test
- ✅ Intake merge runs only on 'fresh'; merged candidates perform zero fetch/audit work
- ✅ Drain backstop guarantees one master per batch; merged tombstone reasons verbatim ('merged', 'merger')
- ✅ possible_dupe_of written on creates only when master id exists
- ✅ `pnpm vitest run packages/dedup packages/scheduler packages/orchestrator packages/discord-router` — all green
- ✅ Full suite: 567 tests across 61 test files — all green
- ✅ No `string-similarity` (deprecated) import; no full-scan findCandidates query
- ✅ Lockfile diff shows exactly one new package: string-similarity-js

## Commits

- `79e31cc` feat(05-05): merger core — attemptMerge, bounded MergeStore, link union, merged tombstone
- `2f05345` feat(05-05): wire merger — tick intake stage, drain backstop, link-union card

## Threat Surface Scan

No new security-relevant surface beyond what was in the plan's threat model. All mitigations (T-05-25..T-05-29, T-05-SC) implemented: threshold + evidence + window mandatory, bounded queries, exact-version pinned dependency, no deprecated string-similarity.

## Self-Check: PASSED

All created files verified present, all commits verified in git history, all 567 tests across 61 test files green.
