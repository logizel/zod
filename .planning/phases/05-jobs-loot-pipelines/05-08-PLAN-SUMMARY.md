---
phase: 05-jobs-loot-pipelines
plan: 08
subsystem: database, config, discord-router
tags: [zod, schema-migration, env, discord-router, audit-card]

# Dependency graph
requires:
  - phase: 04-events-vertical-slice
    provides: existing five-collection hot schema, Opportunity/TaskScratchpad schemas, resolveChannel, buildAuditCard, parseEnv, .env.example
provides:
  - D-14 extended Opportunity schema (nullable/defaulted job + loot fields)
  - D-14 extended TaskScratchpad schema (pipeline + candidate_title)
  - advanceToStep3 scratchpad helper
  - Three channel env keys with empty defaults
  - resolveChannel env-ID-first mapping for three new buckets
  - Per-pipeline audit-card fields (jobs + loot) + registration_links in Links
affects: [05-01, 05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-09]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 15020
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [nullable/defaulted schema migration, env-ID-first channel resolution, per-pipeline optional embed fields]

key-files:
  created:
    - packages/db-hot/src/schema.test.ts - D-14 parse-compat + round-trip tests (5 cases)
  modified:
    - packages/db-hot/src/schema.ts - D-14 Opportunity + TaskScratchpad field extension, INDEX_NOTES step_position
    - packages/db-hot/src/scratchpad.ts - getOrCreateScratchpad pipeline/title params, advanceToStep3
    - packages/db-hot/src/scratchpad.test.ts - Tests 11-15 (pipeline/title persistence, advanceToStep3)
    - packages/config/src/env.ts - DISCORD_CHANNEL_JOBS_SYS_CLOUD/GENERAL/LOOT keys
    - packages/config/src/env.test.ts - channel key default + explicit-ID tests
    - .env.example - 3 channel keys + 4 Pitfall-10 drift keys (bijective with EnvSchema)
    - packages/discord-router/src/router-service.ts - env param on processOpportunity, env-ID-first resolveChannel
    - packages/discord-router/src/router-service.test.ts - env-ID-first + name fallback + skip-path tests (8 tests)
    - packages/discord-router/src/embed.ts - per-pipeline card fields, registration_links in Links
    - packages/discord-router/src/embed.test.ts - jobs/loot per-pipeline + registration_links tests (6 new)

key-decisions:
  - "D-14 one-way migration: nullable/defaulted fields only, no new collection, HOT_COLLECTIONS untouched (locked D-14 decision from 05-CONTEXT.md)"
  - "Env-ID-first channel resolution: bucket value maps to env key before exact-name fallback; unknown channels keep existing skip path"
  - ".env.example drift fix: now lists every EnvSchema key exactly once, including JINA_API_KEY/GROQ_API_KEY/GITHUB_TOKEN/SAMBANOVA_API_KEY (Pitfall 10)"
  - "getOrCreateScratchpad pipeline/title params are optional (defaults 'events'/'') for backward compatibility with existing callers"

requirements-completed: [JOB-02, JOB-04, JOB-05, LOT-01, LOT-02, LOT-03, LOT-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: D-14 Opportunity schema parses Phase 4-shaped rows with defaults; all extended fields round-trip for jobs and loot payloads
    requirement: JOB-02, JOB-04, JOB-05, LOT-01, LOT-02, LOT-03, LOT-04
    verification:
      - kind: unit
        ref: packages/db-hot/src/schema.test.ts#D-14 schema migration (5 tests)
        status: pass
    human_judgment: false
  - id: D2
    description: TaskScratchpad schema defaults pipeline to 'events' and candidate_title to ''; getOrCreateScratchpad/resumeByUrl persist them; advanceToStep3 sets STEP_3
    requirement: JOB-02, JOB-04, JOB-05
    verification:
      - kind: unit
        ref: packages/db-hot/src/scratchpad.test.ts#Tests 11-15
        status: pass
    human_judgment: false
  - id: D3
    description: Three channel env keys default to ''; explicitly set IDs honored; parseEnv passes with absent keys
    requirement: JOB-04, JOB-05, LOT-01
    verification:
      - kind: unit
        ref: packages/config/src/env.test.ts#new channel keys tests (2 tests)
        status: pass
    human_judgment: false
  - id: D4
    description: resolveChannel resolves three new buckets env-ID-first; name fallback when env empty; unknown channel keeps skip path
    requirement: JOB-04, JOB-05, LOT-01
    verification:
      - kind: unit
        ref: packages/discord-router/src/router-service.test.ts#env-ID-first + fallback + skip-path tests (3 tests)
        status: pass
    human_judgment: false
  - id: D5
    description: buildAuditCard renders jobs per-pipeline fields (stack tags, eligibility, apply link) and loot per-pipeline fields (shipping, card required, claim steps); — convention for empty; registration_links union in Links
    requirement: JOB-02, JOB-04, JOB-05, LOT-02, LOT-03, LOT-04
    verification:
      - kind: unit
        ref: packages/discord-router/src/embed.test.ts#per-pipeline + registration_links tests (6 tests)
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-10-16T07:55:22Z
status: complete
---

# Phase 05 Plan 08: Jobs + Loot Pipelines — Contract Foundations Summary

**D-14 one-way schema migration lands with nullable/defaulted job + loot fields, three new channel env keys with env-ID-first resolveChannel, and per-pipeline audit-card fields — every Phase 5 writer now constructs rows against the extended schema from day one.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-16T07:47:22Z
- **Completed:** 2026-10-16T07:55:22Z
- **Tasks:** 2 completed (Task 0 checkpoint pre-confirmed by user)
- **Files modified:** 11 (4 created/extended tests + 7 source + .env.example)

## Accomplishments

- D-14 migration: Opportunity gains experience_span, stack_tags, eligibility_summary, shipping_verified, card_required, claim_steps, registration_links, possible_dupe_of — all nullable/defaulted so Phase 4 rows parse cleanly
- TaskScratchpad gains pipeline (default 'events') and candidate_title (default ''); getOrCreateScratchpad writes both on create, resumeByUrl reads them back, advanceToStep3 sets STEP_3
- HOT_COLLECTIONS untouched — no new collection added; INDEX_NOTES updated with task_scratchpad step_position drain filter
- Three channel env keys (DISCORD_CHANNEL_JOBS_SYS_CLOUD, DISCORD_CHANNEL_JOBS_GENERAL, DISCORD_CHANNEL_LOOT) with empty defaults; .env.example now bijective with EnvSchema including 4 Pitfall-10 drift keys
- resolveChannel maps bucket values to env IDs first (#⚙️→SYS_CLOUD, #💼→GENERAL, #🎁→LOOT), preserves exact-name fallback, unknown channels keep skip path
- buildAuditCard renders per-pipeline optional fields with — convention; registration_links union appended to Links field
- Full test suite green: 233 tests across 35 files, no regressions

## Task Commits

1. **Task 1: D-14 migration — extended Opportunity/TaskScratchpad schemas + scratchpad pipeline/title/advanceToStep3** - `24c1e63` (feat)
2. **Task 2: Channel env keys + resolveChannel env-ID-first + per-pipeline audit-card fields** - `65f7508` (feat)

**Plan metadata:** `65f7508` (docs: complete plan)

## Files Created/Modified

- `packages/db-hot/src/schema.ts` - D-14 field extension on Opportunity + TaskScratchpad, INDEX_NOTES step_position
- `packages/db-hot/src/schema.test.ts` - NEW: 5 D-14 parse-compat + round-trip tests
- `packages/db-hot/src/scratchpad.ts` - getOrCreateScratchpad(pb, url, pipeline, title), advanceToStep3(pb, id)
- `packages/db-hot/src/scratchpad.test.ts` - Tests 11-15 (pipeline/title persistence, advanceToStep3)
- `packages/config/src/env.ts` - 3 channel env keys with empty defaults
- `packages/config/src/env.test.ts` - Channel key default + explicit-ID tests
- `.env.example` - 3 channel keys + 4 Pitfall-10 drift keys (JINA_API_KEY, GROQ_API_KEY, GITHUB_TOKEN, SAMBANOVA_API_KEY)
- `packages/discord-router/src/router-service.ts` - env param on processOpportunity, env-ID-first resolveChannel
- `packages/discord-router/src/router-service.test.ts` - 8 tests: env-ID-first ×3, name fallback, unknown channel skip path
- `packages/discord-router/src/embed.ts` - per-pipeline card fields, registration_links in Links
- `packages/discord-router/src/embed.test.ts` - 6 new tests: jobs/loot per-pipeline fields, — convention, registration_links union

## Decisions Made

- D-14 one-way migration follows the locked CONTEXT.md decision: nullable/defaulted fields only, no new collection, HOT_COLLECTIONS untouched
- Env-ID-first resolution for the three new buckets before name fallback (Pitfall 8 mitigation)
- .env.example drift fixed at source (Pitfall 10 mitigation) — bijective with EnvSchema
- getOrCreateScratchpad pipeline/title params optional with defaults for backward compatibility

## Deviations from Plan

None - plan executed exactly as written. All threat mitigations (T-05-35, T-05-36, T-05-37) implemented: nullable/defaulted migration with parse-compat tests, placeholders-only in .env.example, env-ID-first with skip-path preservation.

## Issues Encountered

None - all TDD RED→GREEN cycles completed cleanly, full suite green.

## User Setup Required

None - no external service configuration required. Channel IDs are placeholders in .env.example; operator fills real Discord channel IDs in .env before Phase 5 writers run.

## Next Phase Readiness

Ready for 05-01 (tracer: orchestrator + Greenhouse → jobs tick → STEP_2 → audit drain → opportunities/tombstone). D-14 schema contract is in place, channel env keys exist with empty defaults, resolveChannel maps the three new buckets, and audit cards render per-pipeline fields.

---
*Phase: 05-jobs-loot-pipelines*
*Completed: 2026-10-16*
