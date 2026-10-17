---
phase: 06-delivery-local-social-coverage
plan: 04
subsystem: orchestrator
tags: [taste-rules, pocketbase, discord.js, zod, orchestrator, zod-schema]

# Dependency graph
requires:
  - phase: 06-delivery-local-social-coverage
    plan: 03
    provides: Orchestrator pipeline foundation, rule packs, gateway client singleton
provides:
  - Taste rule ingestion: three paths (reaction 👍/👎, keyword !rule command, DM) → PocketBase taste_rules with confirmation reply (MEM-04, D-11)
  - Taste rule application: BLOCK pre-scoring filter + BOOST/WEIGHT/CUSTOM system-prompt injection (MEM-04, D-12)
  - D-12/D-13 precedence reconciliation: hard compliance gates → taste BLOCK → soft gates; BLOCK cannot override hard compliance gates
affects:
  - Dashboard/telemetry (future plans) — taste rules surface in audit cards and telemetry

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 8500
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Three ingestion paths (reaction, keyword command, DM) → PB taste_rules + confirmation in originating channel
    - Taste BLOCK as pre-scoring filter before LLM call (tombstones taste_blocked, saves LLM quota)
    - BOOST/WEIGHT/CUSTOM as advisory system-prompt injection; LLM retains final judgment
    - Hard compliance gates evaluated before taste BLOCK (D-13 precedence)
    - Taste rules loaded fresh from PB per audit cycle (no stale cache)

key-files:
  created:
    - packages/discord-router/src/taste-ingest.ts - Taste rule ingestion service (3 paths → PB + confirmation)
    - packages/discord-router/src/taste-ingest.test.ts - 18 unit tests for ingestion service
    - packages/orchestrator/src/taste-apply.ts - Taste rule application module (BLOCK pre-scoring, BOOST injection, hard gates)
    - packages/orchestrator/src/taste-apply.test.ts - 21 unit tests for application module
  modified:
    - packages/db-hot/src/schema.ts - TasteRule schema extended with source field (reaction/keyword/dm)
    - packages/discord-router/src/gateway.ts - startTasteIngestion wired at boot alongside startBookmarkHandler
    - packages/orchestrator/src/rule-packs/events.ts - EventsCtx extended with tasteInjection; appended to system prompt
    - packages/orchestrator/src/orchestrator.ts - Taste rules wired into all 4 pipeline processors (hard gates → taste BLOCK → LLM → soft gates)
    - packages/orchestrator/src/orchestrator.test.ts - taste_rules collection support in test fakes + 2 BLOCK pre-scoring integration tests

key-decisions:
  - "loadTasteRules degrades gracefully (returns []) when taste_rules collection is unavailable — defensive for existing test fakes and production resilience"
  - "Hard compliance gates (pay-to-training, US/EU-only swag, 2+yr roles) checked pre-LLM on candidate title + fetched text, before taste BLOCK (D-13)"
  - "All dependencies (env, log, pb, client) injectable in both taste-ingest and taste-apply for testability"

patterns-established:
  - "Taste rule ingestion follows the bookmark handler pattern: gateway event handlers with injected deps, confirmation reply in originating channel (Pitfall 9)"
  - "Taste rule application: BLOCK = pre-scoring filter (pre-LLM, tombstone), BOOST/WEIGHT/CUSTOM = advisory system-prompt injection (LLM retains final judgment)"
  - "D-13 precedence: hard compliance gates → taste BLOCK pre-scoring → soft gates; BLOCK overrides soft/personal gates only, NOT hard compliance gates"

requirements-completed: [MEM-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: Three ingestion paths (reaction 👍/👎, keyword !rule, DM) create taste_rules rows in PocketBase with source field and confirmation reply in originating channel
    requirement: MEM-04
    verification:
      - kind: unit
        ref: packages/discord-router/src/taste-ingest.test.ts#taste ingestion handler
        status: pass
    human_judgment: false
  - id: D2
    description: BLOCK rules auto-reject candidates before LLM runs (tombstone taste_blocked); BOOST/WEIGHT/CUSTOM injected into system prompt as advisory; hard compliance gates evaluated before taste BLOCK
    requirement: MEM-04
    verification:
      - kind: unit
        ref: packages/orchestrator/src/taste-apply.test.ts#checkBlockRules / buildTastePromptInjection / checkHardComplianceGates
        status: pass
      - kind: unit
        ref: packages/orchestrator/src/orchestrator.test.ts#taste BLOCK pre-scoring tombstones matching candidate before LLM runs
        status: pass
    human_judgment: false

# Metrics
duration: 90min
completed: 2026-10-17
status: complete
---

# Phase 06 Plan 04: Taste Rules Feedback Loop Summary

**Taste rule ingestion (reaction 👍/👎, keyword !rule command, DM) writes to PocketBase taste_rules with confirmation replies, and taste rule application applies BLOCK as a pre-scoring filter and BOOST/WEIGHT/CUSTOM as advisory system-prompt injections, with D-12/D-13 precedence reconciled.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-10-17T10:45:00Z
- **Completed:** 2026-10-17T12:15:00Z
- **Tasks:** 2 completed
- **Commits:** 2

## Accomplishments

- **Task 1 (tracer):** Taste rule ingestion service (`taste-ingest.ts`) with three paths: reaction-based (👍→BOOST, 👎→BLOCK on audit cards), keyword command (`!rule <kind> <text>` in #🧠-bot-training-chat), and DM to bot — all validate via TasteRule zod schema, write to `taste_rules` with `source` field, and post confirmation in the originating channel; bot reactions ignored; partial messages fetched; wired into gateway boot
- **Task 2 (auto):** Taste rule application module (`taste-apply.ts`) implementing hybrid model: `checkBlockRules` (case-insensitive substring match on title/snippet) as pre-scoring filter that tombstones `taste_blocked` before LLM; `buildTastePromptInjection` appends BOOST/WEIGHT/CUSTOM to system prompt as advisory (LLM retains final judgment); `checkHardComplianceGates` enforces D-13 precedence (hard gates → taste BLOCK → soft gates); wired into all four orchestrator pipeline processors

## Task Commits

Each task was committed atomically:

1. **Task 1: Taste rule ingestion — three paths → PB taste_rules + confirmation (tracer)** - `d7d11a9` (feat)
2. **Task 2: Taste rule application — BLOCK pre-scoring filter + BOOST/WEIGHT/CUSTOM system-prompt injection** - `a647ff7` (feat)

## Files Created/Modified

- `packages/discord-router/src/taste-ingest.ts` — Taste rule ingestion service (new)
- `packages/discord-router/src/taste-ingest.test.ts` — 18 unit tests for ingestion (new)
- `packages/orchestrator/src/taste-apply.ts` — Taste rule application module (new)
- `packages/orchestrator/src/taste-apply.test.ts` — 21 unit tests for application (new)
- `packages/db-hot/src/schema.ts` — TasteRule schema extended with `source` field (modified)
- `packages/discord-router/src/gateway.ts` — `startTasteIngestion` wired at boot (modified)
- `packages/orchestrator/src/rule-packs/events.ts` — `EventsCtx` extended with `tasteInjection`; appended to system prompt (modified)
- `packages/orchestrator/src/orchestrator.ts` — Taste rules wired into all 4 pipeline processors (modified)
- `packages/orchestrator/src/orchestrator.test.ts` — `taste_rules` collection support in test fakes + 2 BLOCK pre-scoring integration tests (modified)

## Decisions Made

- Followed the plan exactly as specified — all D-nnn decisions from 06-CONTEXT.md and 06-RESEARCH.md were implemented as documented
- `loadTasteRules` degrades gracefully (returns `[]`) when `taste_rules` collection is unavailable, preventing crashes in environments where the collection hasn't been created yet
- Hard compliance gates implemented as pre-LLM checks on candidate title + fetched text (pay-to-training, US/EU-only swag, 2+yr roles), before taste BLOCK evaluation

## Deviations from Plan

None - plan executed exactly as written. All implementation steps, done criteria, and verification commands were followed.

## Issues Encountered

None - all tasks completed successfully with all tests passing (207 orchestrator tests, 188 discord-router tests, 32 db-hot tests).

## User Setup Required

None - no external service configuration required for this plan. The `taste_rules` collection already exists in the PocketBase schema (seeded empty in Phase 5).

## Next Phase Readiness

Plan 06-04 is complete. The taste-rules feedback loop is fully implemented: operators can post feedback via three paths in #🧠-bot-training-chat, and the auditor applies BLOCK rules as pre-scoring filters and BOOST/WEIGHT/CUSTOM as advisory system-prompt injections with proper D-12/D-13 precedence. Ready for subsequent Phase 6 plans (dashboard, telemetry).

---

*Phase: 06-delivery-local-social-coverage*
*Completed: 2026-10-17*
