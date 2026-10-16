---
gsd_state_version: "1.0"
current_phase: 05
current_phase_name: Jobs + Loot Pipelines
status: executing
stopped_at: Completed 05-09-PLAN.md — unit + wiring test coverage for gates, registry, tick sources, and Greenhouse adapter
last_updated: "2026-10-16T09:55:00Z"
last_activity: 2026-10-16
last_activity_desc: Executed plan 05-09 — unit + wiring coverage for gates, registry tables, tick sources, and Greenhouse adapter; 1 task commit; full suite green (507 tests)
state_head: 28aadbf2fdd7e2858b44a558a96f7697c1300518
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 22
  completed_plans: 17
  percent: 77
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-15)

**Core value:** Only verified, deduplicated, high-signal opportunities reach Discord — every online event has audited cash ≥₹1,00,000 or a real perk with India shipping, every job is true 0–1yr/intern, every alert links the official source.
**Current focus:** Phase 05 — Jobs + Loot Pipelines

## Current Position

Phase: 05 (Jobs + Loot Pipelines) — EXECUTING
Plan: 5 of 9 (05-08 complete, 05-01 complete, 05-02 complete, 05-03 complete, 05-04 complete, 05-09 complete)
Status: Executing Phase 05 — plan 05-09 complete (unit + wiring test coverage for gates, registry, tick sources, and Greenhouse adapter)
Last activity: 2026-10-16 — Completed plan 05-09 (unit + wiring coverage for gates, registry tables, tick sources, and Greenhouse adapter), 1 task commit, full suite green (507 tests)

Progress: [█████████░] 77%

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02 | 3 | - | - |
| 03 | 3 | - | - |
| 04 | 3 | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 5 min | 3 tasks | 18 files |
| Phase 01 P03 | 9 min | 2 tasks | 13 files |
| Phase 01 P02 | 12 min | 3 tasks | 17 files |
| Phase 01 P04 | 12 min | 3 tasks | 17 files |
| Phase 05 05-08 | 8 min | 2 tasks | 11 files |
| Phase 05 05-01 | 42 min | 1 task | 21 files |
| Phase 05 05-02 | 29 min | 2 tasks | 20 files |
| Phase 05 05-03 | 17 min | 2 tasks | 17 files |
| Phase 05 05-04 | 20 min | 3 tasks | 18 files |
| Phase 05 05-09 | 6 min | 1 task | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: MVP vertical slices — first verified Discord alert in Phase 4, local/social coverage deferred to Phase 6
- [Roadmap]: Cerebras disabled by default (billing trap) — enforced in Phase 3 gateway
- [Roadmap]: Dedup merger (EVT-07) ships with Jobs/Loot phase, not scraper foundation — needs live multi-source volume
- [Phase 01]: Approved all seven recency-flagged packages; installed six, eventsource deferred to 01-02 — Wave 1 merge verified: build + vitest 5/5 green
- [Phase 01]: Confirmed five-collection schema lock (confirm-full-set) with one-way-migration acknowledgment — Wave 2 merged: build + 50/50 vitest green; Turso live proof deferred to 01-04 drill
- [Phase 01]: Selected PB server v0.40.5 (Option B, Go HTTP DoS fix) over locked v0.35.x; fallback to v0.35.x on incompatibility; drills prove in local modes, live deferred to real host — Wave 3 merged: build + 50/50 green, four drills PASS in local modes
- [Phase 05 05-08]: D-14 one-way schema migration — nullable/defaulted fields only, no new collection, HOT_COLLECTIONS untouched (locked CONTEXT decision)
- [Phase 05 05-08]: resolveChannel env-ID-first for three new bucket channels before exact-name fallback; unknown channels keep skip path (Pitfall 8)
- [Phase 05 05-08]: .env.example bijective with EnvSchema — 3 channel keys + 4 Pitfall-10 drift keys added (Pitfall 10)
- [Phase 05 05-02]: D-02 seed + auto-learn board rotation — extractBoardUrl (3 ATS hosts), learnBoard idempotent + capped at 200, loadBoards seed∪learned
- [Phase 05 05-02]: getJobCandidates fan-out — 8 JOB_LIST_FNS + learned-board fan-out through provider adapters, URL dedupe, next-tick learnBoard harvest
- [Phase 05 05-02]: Workday cxs JSON first ([ASSUMED A1]) with exactly-one fetchViaBrowser fallback (D-03)
- [Phase 05 05-03]: DEFAULT_FELLOWSHIP_ALLOWLIST in @zod/config with FELLOWSHIP_ALLOWLIST_EXTRA env extension, fail-closed on unknown programs (T-05-18)
- [Phase 05 05-03]: evaluateJobsGates keeps final reject authority; deterministic predicates re-parse from fetched text (T-05-14)
- [Phase 05 05-03]: D-04 senior screen whole-word case-insensitive title regex; 'Leadership'/'Managerial' do not match (Pitfall 9)
- [Phase 05 05-03]: Listing-stage scam/geo detectors flag-only (telemetry), never auto-reject (T-05-16, T-05-17)
- [Phase 05 05-04]: drainLootRow named export reused verbatim by events divert — zero duplicated logic between direct loot branch and divert
- [Phase 05 05-04]: Event buckets read Phase 4 constants verbatim: sys-cp-sec → '#🔥-priority-sys-cp-sec', general → '#-online-1lakh-plus'; no invented bucket strings
- [Phase 05 05-04]: Domain filter reuses @zod/discord-router/domain-filter prefilter with organizer_score/agenda_score; tombstone reason uses its vocabulary verbatim
- [Phase 05 05-04]: Vendor watchlist uses globalThis.fetch + validateUrl (SSRF guard) + keyword layer; never-throw entry isolation; config-owned fixed hosts only

### Pending Todos

None yet.

### Blockers/Concerns

- Free-tier provider lineup rotates quarterly — re-verify model IDs/limits at Phase 3 planning (research flag)
- X/LinkedIn session posture + DK/Udupi domain inventory need review as gates before Phase 6 build

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-16T09:40:25Z
Stopped at: Completed 05-04-PLAN.md — loot vertical core + events completion + vendor watchlist
Resume file: .planning/phases/05-jobs-loot-pipelines/05-CONTEXT.md
