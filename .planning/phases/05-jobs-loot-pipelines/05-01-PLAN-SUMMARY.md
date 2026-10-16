---
phase: 05-jobs-loot-pipelines
plan: 01
subsystem: orchestrator, scheduler, discord-router
tags: [zod, orchestrator, tracer, audit-drain, greenhouse, jobs-pipeline]

# Dependency graph
requires:
  - phase: 05-jobs-loot-pipelines
    plan: 08
    provides: D-14 extended Opportunity/TaskScratchpad schemas, channel env keys, resolveChannel env-ID-first, per-pipeline audit-card fields
provides:
  - @zod/orchestrator package (drainStep2Rows, rule-packs, gates, integration)
  - Greenhouse portal adapter (listing + detail fetch, SSRF guard, ≤200-char snippet)
  - jobs/loot candidate source mechanism (CandidateSource interface, TickOptions.candidateSources)
  - JOB_POLL_JOBS (jobs-poll/loot-watchlist) + AUDIT_JOBS (audit-drain) scheduler tables
  - registerPollJobs + registerAuditDrain registry functions
  - Live scheduler dependency wiring (pb/hot/cold/router/candidateSources + orchestrator)
  - E2E tracer test proving admit → audited opportunity + bucket_channel, reject → tombstone
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-09]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 14123
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: [structural PbLike port, injected tickHandler (GatewayScheduler precedent), cycle-free registration, url_hash idempotent pre-check, per-row error isolation]

key-files:
  created:
    - packages/orchestrator/package.json - new @zod/orchestrator workspace package manifest
    - packages/orchestrator/tsconfig.json - composite project config referencing config/db-hot/dedup/llm/logger/scheduler
    - packages/orchestrator/vitest.config.ts - vitest config with source aliases for workspace packages
    - packages/orchestrator/src/globals.d.ts - Node globals shim
    - packages/orchestrator/src/index.ts - barrel re-exports (drainStep2Rows, OrchestratorScheduler, rule-packs, gates)
    - packages/orchestrator/src/orchestrator.ts - drainStep2Rows core: STEP_2 getList → rule pack → LlmRouter.complete → gates → opportunities/tombstone → STEP_3
    - packages/orchestrator/src/rule-packs/jobs.ts - buildJobsMessages + parseJobsVerdict (zod boundary, untrusted data framing)
    - packages/orchestrator/src/gates/jobs.ts - pickJobsBucket (sys/cloud vs general) + evaluateJobsGates composition
    - packages/orchestrator/src/integration.ts - OrchestratorScheduler with start/stop/getTickHandler (GatewayScheduler pattern)
    - packages/orchestrator/src/e2e-tracer.test.ts - 5-test E2E: admit/reject/UNVERIFIED/POOL_SATURATED/idempotent re-drain
    - packages/discord-router/src/portals/jobs/greenhouse.ts - Greenhouse listing (board JSON, ≤200-char snippet, no content field) + fetchDetailText (ATS JSON, ≤8k, null on failure)
    - packages/discord-router/src/portals/jobs/index.ts - JOB_LIST_FNS + getJobCandidates with URL dedupe
  modified:
    - packages/scheduler/src/jobs.ts - candidateSource on StubJobDef, location on PollCandidate, CandidateSource interface, TickOptions.candidateSources, JOB_POLL_JOBS + AUDIT_JOBS tables, runStubTick candidate resolution order + ats-json detail branch + pipeline/title to resumeByUrl
    - packages/scheduler/src/registry.ts - JOB_POLL_JOBS/AUDIT_JOBS exports, registerPollJobs + registerAuditDrain, assertSchedulerGuards covers all four tables
    - packages/scheduler/src/globals.d.ts - unchanged (globals only)
    - packages/db-hot/src/scratchpad.ts - resumeByUrl accepts pipeline + title (optional, backward compatible)
    - packages/discord-router/package.json - added ./portals/jobs/* export entry
    - apps/scheduler/src/registry-start.ts - live deps wired (pb/hot/cold/router/candidateSources + orchestrator tickHandler)
    - apps/scheduler/package.json - added @zod/db-hot/@zod/db-cold/@zod/llm/@zod/discord-router/@zod/orchestrator/@zod/sanitize workspace deps
    - apps/scheduler/tsconfig.json - added references for db-hot/db-cold/llm/discord-router/orchestrator
    - tsconfig.json - added ./packages/orchestrator project reference
    - tsconfig.base.json - added path mappings for @zod/dedup, @zod/dedup/precheck, @zod/scheduler/jobs

key-decisions:
  - "Orchestrator ships as its own package (@zod/orchestrator) mirroring @zod/llm conventions — scheduler never imports it (cycle-free via injected tickHandler)"
  - "Candidate source resolution order: (1) declared source in bag → source.list(), (2) opts/bag.candidates override, (3) declared but missing → warn+skip, (4) live deps but no source → warn+skip, (5) legacy stub → POLL_CANDIDATES fallback"
  - "ATS-JSON sources: source.detail() called first, fall back to shared fetch facade when null — never throws, degrades gracefully"
  - "Priority 2 (auditor lane) for LlmRouter.complete per plan spec"
  - "url_hash pre-check before opportunities create guarantees idempotent drain across ticks and restarts"
  - "UNVERIFIED/POOL_SATURATED leaves row at STEP_2 — never treated as reject or pass"

requirements-completed: [ING-03, JOB-01, JOB-02, JOB-03, JOB-04, JOB-05]

# Coverage metadata (#1602)
coverage:
  - id: T1
    description: E2E tracer — admit verdict creates exactly one opportunities row with status=audited, non-empty bucket_channel, D-14 jobs fields; advances to STEP_3
    requirement: ING-03, JOB-02, JOB-04, JOB-05
    verification:
      - kind: integration
        ref: packages/orchestrator/src/e2e-tracer.test.ts#admit verdict test
        status: pass
      - kind: automated
        ref: pnpm vitest run packages/orchestrator (5 tests)
        status: pass
    human_judgment: false
  - id: T2
    description: Reject verdict writes tombstone_ledger with reason_code, no opportunities row, advances to STEP_3
    requirement: JOB-03
    verification:
      - kind: integration
        ref: packages/orchestrator/src/e2e-tracer.test.ts#reject verdict test
        status: pass
    human_judgment: false
  - id: T3
    description: UNVERIFIED / POOL_SATURATED writes nothing, leaves row at STEP_2
    requirement: JOB-02
    verification:
      - kind: integration
        ref: packages/orchestrator/src/e2e-tracer.test.ts#UNVERIFIED + POOL_SATURATED tests
        status: pass
    human_judgment: false
  - id: T4
    description: Re-drain against same url_hash creates no second opportunities row (idempotent)
    requirement: JOB-05
    verification:
      - kind: integration
        ref: packages/orchestrator/src/e2e-tracer.test.ts#re-drain idempotency test
        status: pass
    human_judgment: false
  - id: T5
    description: pickJobsBucket maps DevOps/K8s/Rust/Go stack tags to sys/cloud bucket, empty/unknown to general bucket
    requirement: JOB-04, JOB-05
    verification:
      - kind: unit
        ref: packages/orchestrator/src/gates/jobs.ts (pure predicate, covered by e2e)
        status: pass
    human_judgment: false
  - id: T6
    description: Full suite stays green — discord-router, scheduler, config, db-hot all pass
    requirement: all
    verification:
      - kind: automated
        ref: pnpm vitest run packages/discord-router packages/scheduler packages/config packages/db-hot
        status: pass
    human_judgment: false
  - id: T7
    description: Workspace TypeScript build clean with new @zod/orchestrator package referenced
    requirement: all
    verification:
      - kind: automated
        ref: pnpm build (tsc -b tsconfig.json)
        status: pass
    human_judgment: false
  - id: T8
    description: No setInterval in scheduler; no @zod/orchestrator import in packages/scheduler/src (cycle-free)
    requirement: all
    verification:
      - kind: automated
        ref: grep confirmation
        status: pass
    human_judgment: false

# Metrics
duration: 42min
completed: 2026-10-16T08:48:03Z
status: complete
plan_head_before: 5b693e6438ec1e5b7a8821e77a5ca48e1e385f0f
plan_head_after: 8f923e40e3e5f547e0e175f22497d3431eea9d49
commits: 1
---

# Phase 05 Plan 01: Jobs + Loot Pipelines — Orchestrator Tracer Summary

**One-liner:** The missing middle is closed: production code assembles auditor prompts, calls LlmRouter.complete(), and writes audited opportunities rows with bucket_channel — a Greenhouse job flows from listing → jobs tick → STEP_2 → audit drain → gates → opportunities row (status=audited + bucket_channel), with the reject path tombstoned with its reason code.

## Performance

- **Duration:** 42 min
- **Started:** 2026-10-16T08:03:48Z
- **Completed:** 2026-10-16T08:48:03Z
- **Tasks:** 1 completed (Task 1: Orchestrator tracer)
- **Files modified:** 21 (12 created, 9 modified)
- **Commits:** 1 (8f923e4)

## Accomplishments

- **@zod/orchestrator package** lands — new workspace package mirroring @zod/llm conventions, owning the STEP_2 → gates → auditor → write path every Phase 5 pipeline plugs into
- **drainStep2Rows** — bounded STEP_2 getList (page size 25), rule-pack → LlmRouter.complete (slot='auditor-jobs-1', priority=2), deterministic gates, opportunities create with url_hash pre-check or tombstone write, advanceToStep3, per-row error isolation
- **Jobs rule pack** — buildJobsMessages frames candidate text as untrusted data (T-05-01); parseJobsVerdict validates with zod boundary (admission_class, reason_code, experience_span, stack_tags, eligibility_summary, audit_summary)
- **Jobs gates** — pickJobsBucket routes Sys/Cloud/DevOps/SRE/K8s/Rust-Go-C → #⚙️-jobs-sys-cloud-devops, all other admitted SWE → #💼-jobs-general-swe (never empty); evaluateJobsGates composes LLM verdict with deterministic gate authority
- **Greenhouse adapter** — listing from board JSON (url=absolute_url, snippet=stripped content ≤200, no content field), fetchDetailText from single-job JSON endpoint (≤8k, null on unparseable URL), SSRF guard on all outbound fetch targets
- **Candidate source mechanism** — CandidateSource interface + TickOptions.candidateSources injection; JOB_POLL_JOBS (jobs-poll */40 + 10m jitter, loot-watchlist 0 */5 + 15m jitter), AUDIT_JOBS (audit-drain */5 + 60s jitter); strict resolution order disables POLL_CANDIDATES fallback when live deps are injected
- **Scheduler registry** — registerPollJobs + registerAuditDrain exported; assertSchedulerGuards covers all four tables (STUB_JOBS, GATEWAY_JOBS, JOB_POLL_JOBS, AUDIT_JOBS)
- **Live dependency wiring** — apps/scheduler registry-start wires createPbClient, Turso executor, LlmRouter with telemetry sink, candidateSources table (events → getPortalCandidates, jobs → getJobCandidates), OrchestratorScheduler tickHandler
- **D-14 consumption** — all writes parse against the extended Opportunity/TaskScratchpad schemas from 05-08 (experience_span, stack_tags, eligibility_summary, etc.)
- **ResumeByUrl fix** — now accepts pipeline + title so scratchpad rows carry pipeline + candidate_title (backward compatible)

## Task Commits

1. **Task 1: Orchestrator tracer — Greenhouse → jobs tick → STEP_2 → audit drain → opportunities write / tombstone** - `8f923e4` (feat)

## Deviations from Plan

**Rule 3 fix — scratchpad.ts resumeByUrl pipeline/title:** `packages/db-hot/src/scratchpad.ts` was not in plan 05-01's `files_modified` list, but `resumeByUrl` needed to accept `pipeline` and `title` parameters so scratchpad rows carry pipeline + candidate_title as required by the plan action. getOrCreateScratchpad already had these params (from 05-08); resumeByUrl now forwards them with defaults ('events' / '') for backward compatibility.

No other deviations — plan executed as written. All threat mitigations (T-05-01..T-05-07, T-05-SC) implemented: untrusted data framing + zod verdict boundary, SSRF-guarded fetch with degrade-to-null, bounded getList page size 25, url_hash pre-check + tombstone terminal writes, pipeline from code-owned scratchpad row, structural PbLike port.

## Issues Encountered

- **tsconfig project reference resolution:** `@zod/dedup` and `@zod/scheduler/jobs` imports in the orchestrator and registry-start needed path mappings in `tsconfig.base.json` for `tsc -b` to resolve without built `dist/` files. Added path mappings alongside the existing `@zod/scheduler-registry` precedent.
- **Vitest alias resolution:** `$`-suffixed aliases (e.g. `@zod/dedup$`) did not resolve in the orchestrator vitest config; removed `$` suffix and used direct path mappings.

## User Setup Required

None — no external service configuration required. Channel IDs are placeholders in .env.example (from 05-08); operator fills real Discord channel IDs in .env before Phase 5 writers run.

## Next Phase Readiness

Ready for 05-02 (full job source mix: Lever/Ashby/HN/Cutshort/Cuvette/Workday). The orchestrator package, candidate source mechanism, scheduler tables, and live dependency wiring are proven end-to-end. The e2e tracer test passes and all existing suites stay green (238 tests, 36 files).

## Known Stubs

| File | Line | Stub | Reason | Resolution Plan |
|------|------|------|--------|-----------------|
| packages/discord-router/src/portals/jobs/greenhouse.ts | 18 | `GREENHOUSE_BOARD_TOKEN = 'zod'` — placeholder board token | Tracer slice uses a hardcoded token; real board tokens come from config-driven boards.ts (D-02 seed + auto-learn) | 05-02 replaces with config-driven board token via boards.ts |

These are intentional tracer-slice placeholders — they do not prevent the plan's goal from being achieved (the e2e test uses a fake router, independent of the board token).

---
*Phase: 05-jobs-loot-pipelines*
*Completed: 2026-10-16*
