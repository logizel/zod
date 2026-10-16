---
phase: 05-jobs-loot-pipelines
plan: 02
subsystem: discord-router
tags: [jobs, sourcing, ATS, browser, auto-learn, tdd]
dependency_graph:
  requires: [05-01]
  provides: [05-03, 05-07]
tech_stack:
  added: [cheerio, zod, node:fs]
  patterns: [listing-first PollCandidate, atomic tmp+rename state writes, fetchViaBrowser shared browser queue]
key_files:
  created:
    - packages/discord-router/src/portals/jobs/lever.ts
    - packages/discord-router/src/portals/jobs/lever.test.ts
    - packages/discord-router/src/portals/jobs/ashby.ts
    - packages/discord-router/src/portals/jobs/ashby.test.ts
    - packages/discord-router/src/portals/jobs/hn-whoshiring.ts
    - packages/discord-router/src/portals/jobs/hn-whoshiring.test.ts
    - packages/discord-router/src/portals/jobs/startup-jobs.ts
    - packages/discord-router/src/portals/jobs/startup-jobs.test.ts
    - packages/discord-router/src/portals/jobs/boards.ts
    - packages/discord-router/src/portals/jobs/boards.test.ts
    - packages/discord-router/src/portals/jobs/cutshort.ts
    - packages/discord-router/src/portals/jobs/cutshort.test.ts
    - packages/discord-router/src/portals/jobs/cuvette.ts
    - packages/discord-router/src/portals/jobs/cuvette.test.ts
    - packages/discord-router/src/portals/jobs/workday.ts
    - packages/discord-router/src/portals/jobs/workday.test.ts
    - packages/discord-router/src/portals/jobs/index.ts
    - packages/discord-router/src/portals/jobs/index.test.ts
  modified:
    - packages/discord-router/src/portals/jobs/greenhouse.ts (added board override option for learned-board fan-out)
decisions:
  - "Both hosts tried for Lever (api.lever.co + api.eu.lever.co), first ok response wins — no site-level EU/US split needed"
  - "HN created_at_i watermark persisted in boards state file under per-source key 'hn-whoshiring', opts.since as first-run floor"
  - "Workday cxs JSON listing first ([ASSUMED A1]) with exactly-one fetchViaBrowser browser fallback (D-03); WORKDAY_SITES const of {tenant, wd, site} tuples"
  - "Learned boards snapshotted at getJobCandidates call start; learnBoard harvest runs after dedupe so boards learned during a call fan out on the NEXT tick"
  - "learnBoard caps learned set at 200 entries to bound state growth (T-05-11)"
metrics:
  duration_minutes: 29
  completed_date: "2026-10-16T08:52:00Z"
status: complete
actuals:
  tokens: 16101
  tasks: 2
  commits: 2
plan_head_before: e1c9d7d8265137966dca464e85cec2d6e68947f6
plan_head_after: e9ad644b6f056c213e4885071396d7c665b00f10
---

# Phase 05 Plan 02: Jobs + Loot Pipelines — Browser Sources + D-02 Auto-Learn Summary

**One-liner:** Seven job source adapters (Lever, Ashby, HN Algolia, startup.jobs, Cutshort, Cuvette, Workday) plus D-02 seed + auto-learn board rotation and extended getJobCandidates fan-out, all fixture-tested with zero live network IO.

## Execution Summary

Plan 05-02 executed fully autonomously with 2 tasks, both using TDD (RED→GREEN→REFACTOR). All 49 tests across 9 test files pass; full discord-router suite is 99/99; scheduler + config suites unaffected (27/27); full workspace build clean.

**Task 1** (`fetch-based sources`): Lever, Ashby, HN Who-is-hiring, startup.jobs adapters + boards state-file core. All mirror the 05-01 greenhouse.ts `list() → PollCandidate[]` contract (title + ≤200-char snippet, non-ok → [], never throw). Lever tries both api.lever.co and api.eu.lever.co. HN uses the two-call Algolia recipe with created_at_i watermark persisted via boards state helpers. startup.jobs parses XML/RSS via cheerio xmlMode. boards.ts provides SEED_BOARDS (10 curated entries), atomic readStateFile/writeStateFile (tmp+rename), corrupt/missing → null degradation, watermark helpers.

**Task 2** (`browser sources + D-02 auto-learn + getJobCandidates fan-out`): Cutshort and Cuvette scrape via fetchViaBrowser (shared 2-concurrency queue, no chromium.launch) with bounded 2-page pagination and contiguous seams. Workday tries cxs JSON POST first ([ASSUMED A1]) with exactly-one fetchViaBrowser fallback (D-03). boards.ts extended with extractBoardUrl (3 ATS hosts), learnBoard (idempotent, exactly-once, cap 200), loadBoards (seed ∪ learned). index.ts getJobCandidates fans out all 8 JOB_LIST_FNS plus learned-board fan-out through provider adapters, URL-deduplicates, harvests ATS board URLs via learnBoard (next-tick fan-out), stable ordering across runs.

## Deviations from Plan

None — plan executed exactly as written. All must_haves, artifacts, and acceptance criteria met.

## Threat Surface Scan

No new security-relevant surface beyond the plan's threat_model. All eight sources use fixed code-owned hosts (T-05-09 SSRF mitigation). All adapters validate URLs via `validateUrl` from `@zod/sanitize/fetch` (T-05-08). Learned-board state uses atomic tmp+rename, zod validation, corrupt/missing → seed-only degradation, and 200-entry cap (T-05-11). No new dependencies added (T-05-SC).

## Stub Tracking

None — all adapters return real parsed data from fixtures; no hardcoded empty values, placeholder text, or unwired props.

## Authentication Gates

None — all sources are unauthenticated public endpoints; no credentials required.

## Self-Check: PASSED

All created files verified on disk; both task commits (49a1a22, e9ad644) verified in git history.

## Verification

- `pnpm vitest run packages/discord-router` — 99/99 tests green (21 test files)
- `pnpm vitest run packages/scheduler packages/config` — 27/27 tests green (unaffected)
- `pnpm build` — workspace build clean
- Info-level greps: no chromium import under portals/jobs, no setInterval in new modules, no YC/Wellfound hostnames (05-07 owns those)
- All tests perform zero live network IO (fetch and browser functions stubbed/injected)
