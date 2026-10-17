---
phase: 06-delivery-local-social-coverage
plan: 05
subsystem: auth
tags: ["zod", "discord", "env-schema", "operator-allowlist", "authorization", "taste-rules"]

# Dependency graph
requires:
  - phase: 06-delivery-local-social-coverage
    provides: taste-ingestion handler (createTasteIngestionHandler Path 3 DM path) + EnvSchema in @zod/config
provides:
  - OPERATOR_USER_IDS env key (z.string().default('')) in EnvSchema + .env.example bijection
  - Operator allowlist enforcement before Path 3 DM !rule processing in taste-ingest.ts
affects:
  - 06-06 (G-06-2 keyword-command operator allowlist, taste-ingest.ts Path 2)
  - 06-07 (G-06-3 social cookie path confinement)

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 1736
  tasks: 2
  commits: 2
  plan_head_before: 8eaa055c65a1f998796d362f18640f9155a2e13b
  plan_head_after: 3aba6c6e9aa988efb393f46ecd4dd6fb1a4232a

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-closed operator allowlist: OPERATOR_USER_IDS defaults to '' => no operators authorized"
    - "Env-drift bijection: every EnvSchema key mirrored in .env.example (Pitfall-10 guard)"
    - "zod string().default('') pattern for optional env keys (FELLOWSHIP_ALLOWLIST_EXTRA precedent)"

key-files:
  created: []
  modified:
    - packages/config/src/env.ts - added OPERATOR_USER_IDS: z.string().default('')
    - .env.example - added OPERATOR_USER_IDS= (env-drift bijection)
    - packages/config/src/env.test.ts - defaults-to-empty + configured-value tests
    - packages/discord-router/src/taste-ingest.ts - Path 3 DM allowlist check before parseRuleCommand
    - packages/discord-router/src/taste-ingest.test.ts - unauthorized/empty/authorized DM tests

key-decisions:
  - "OPERATOR_USER_IDS defaults to '' (fail-closed): no operators authorized until explicitly configured"
  - "Allowlist check placed in Path 3 (DM) only per plan scope (G-06-1 / CR-02); Path 2 keyword path is a separate gap (G-06-2)"
  - "Comma-separated Discord user IDs split on ',' with filter(Boolean) to tolerate whitespace/empty entries"

requirements-completed: [MEM-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "OPERATOR_USER_IDS operator allowlist added to EnvSchema and .env.example (bijection guard)"
    requirement: MEM-04
    verification:
      - kind: unit
        ref: "packages/config/src/env.test.ts#OPERATOR_USER_IDS defaults to empty string when absent"
        status: pass
      - kind: unit
        ref: "packages/config/src/env.test.ts#explicitly set OPERATOR_USER_IDS is returned as configured"
        status: pass
      - kind: unit
        ref: "packages/config/src/env-drift.test.ts#schema and example key sets are identical (bijection)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Path 3 DM !rule operator allowlist enforced before taste-rule creation"
    requirement: MEM-04
    verification:
      - kind: unit
        ref: "packages/discord-router/src/taste-ingest.test.ts#rejects DM !rule from unauthorized user (no taste rule created)"
        status: pass
      - kind: unit
        ref: "packages/discord-router/src/taste-ingest.test.ts#rejects DM !rule when OPERATOR_USER_IDS is empty (fail-closed)"
        status: pass
      - kind: unit
        ref: "packages/discord-router/src/taste-ingest.test.ts#creates rule from DM to bot (authorized operator, source 'dm')"
        status: pass
    human_judgment: false

# Metrics
duration: 5 min
completed: 2026-10-17
status: complete
---

# Phase 06 Plan 05: Gap Closure G-06-1 / CR-02 Summary

**OPERATOR_USER_IDS operator allowlist added to EnvSchema and enforced before Path 3 DM taste-rule creation — only configured operators can create system-wide taste rules via DM, fail-closed when unset.**

## Performance

- **Duration:** 5 min (355s)
- **Started:** 2026-10-17T07:33:40Z
- **Completed:** 2026-10-17T07:39:35Z
- **Tasks:** 2/2 completed
- **Files modified:** 5 (env.ts, .env.example, env.test.ts, taste-ingest.ts, taste-ingest.test.ts)

## Accomplishments

- `OPERATOR_USER_IDS: z.string().default('')` added to EnvSchema in `@zod/config` (fail-closed default)
- `OPERATOR_USER_IDS=` added to `.env.example` preserving the env-drift bijection guard
- Path 3 (DM) handler in `createTasteIngestionHandler` rejects `!rule` from non-operators with `❌ You are not authorized to create taste rules.` and creates no taste rule
- Authorized operators (IDs in `OPERATOR_USER_IDS`) can create DM taste rules with source `dm`
- Empty `OPERATOR_USER_IDS` rejects all DM `!rule` commands (fail-closed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add OPERATOR_USER_IDS to EnvSchema, .env.example, and env test** - `ad6628c` (feat)
2. **Task 2: Add operator allowlist check to Path 3 DM handler in taste-ingest.ts** - `3aba6c6` (feat)

## Files Created/Modified

- `packages/config/src/env.ts` - Added `OPERATOR_USER_IDS: z.string().default('')` to EnvSchema
- `.env.example` - Added `OPERATOR_USER_IDS=` (env-drift bijection)
- `packages/config/src/env.test.ts` - Tests: defaults to `''`, returns configured comma-separated value
- `packages/discord-router/src/taste-ingest.ts` - Path 3 DM allowlist check before `parseRuleCommand`
- `packages/discord-router/src/taste-ingest.test.ts` - Tests: unauthorized DM rejected, empty allowlist rejected, authorized operator creates rule

## Decisions Made

- Fail-closed default `''` for `OPERATOR_USER_IDS` — no operators authorized until explicitly configured (prevents authorization bypass)
- Comma-separated Discord user IDs split on `,` with `filter(Boolean)` to tolerate whitespace/empty entries
- Path 3 only per plan scope (G-06-1 / CR-02); Path 2 keyword path is a separate gap (G-06-2)

## Deviations from Plan

None - plan executed exactly as written. All two tasks completed and committed; all success criteria met (env-drift bijection passes, DM authorization enforced, existing tests continue to pass).

## Issues Encountered

- A pre-existing, unrelated test failure exists in `packages/discord-router/src/router-service.test.ts` > `processOpportunity` ("falls back to exact-name match when env ID is empty for a new bucket"). This file and `router-service.ts` are unmodified by this plan — the failure is pre-existing at HEAD `8eaa055` and relates to the CR-03 `resolveChannel` name-fallback (`caches` vs `cache`), a separate gap not covered by G-06-1. It is out of scope for 06-05 per the scope boundary (only auto-fix issues directly caused by current task changes). Logged to `deferred-items.md` for tracking.

## User Setup Required

None - no external service configuration required. `OPERATOR_USER_IDS` is optional (defaults to `''`); operators must be configured in `.env` as comma-separated Discord user IDs before DM taste-rule creation is authorized.

## Next Phase Readiness

- Gap G-06-1 (CR-02) closed: DM taste-rule creation is operator-authorized.
- Remaining phase-06 gaps: G-06-2 (keyword-command operator allowlist, Path 2) and G-06-3 (social cookie path confinement) are tracked separately and are not blocked by this plan.

## Self-Check: PASSED

- Created files exist: `packages/config/src/env.ts`, `.env.example`, `packages/discord-router/src/taste-ingest.ts`, `.planning/phases/06-delivery-local-social-coverage/06-05-SUMMARY.md`
- Commits exist: `ad6628c` (Task 1), `3aba6c6` (Task 2)
- No missing items.
