---
phase: 06-delivery-local-social-coverage
plan: 02
subsystem: orchestrator
tags: [tba, re-audit, discord-router, zod, pocketbase, vitest]

# Dependency graph
requires:
  - phase: 06-delivery-local-social-coverage
    plan: 01
    provides: Local/Social CandidateSources, scheduler registry, env schema, gateway intents, CHANNEL_ID_ENV_KEYS
provides:
  - Local DK/Udupi offline routing to #📍-local-dk-udupi regardless of prize size (EVT-03)
  - Out-of-town offline travel-curated routing to #✈️-travel-curated with selection round + quality gate (EVT-04)
  - TBA two-ping 48h re-audit loop with Ping #1/#2 (EVT-06)
affects:
  - 06-03 (taste rule ingestion/application)
  - 06-04 (dashboard, telemetry)

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 23274
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TBA re-audit scan runs inside existing audit-drain tick (every 5m + 60s jitter) — no new scheduler job (D-10)
    - Ping #1 fires at first TBA detection in processEventsRow and drainLocalRow — routes to #⏳-early-tba-radar with deadlines.tba=true, skips prize gate
    - Ping #2 fires on prize/date confirmation (status: audited) or event expiry (status: expired, tombstone event_expired) — tba flag cleared on either terminal condition
    - Per-row error isolation in TBA re-audit scan — one bad row never aborts the batch

key-files:
  created:
    - packages/orchestrator/src/tba-loop.ts - TBA re-audit module: tbaReauditScan, Ping #2 confirmed/expired logic
    - packages/orchestrator/src/tba-loop.test.ts - 10 unit tests for TBA re-audit scan
  modified:
    - packages/orchestrator/src/orchestrator.ts - TBA import, TBA scan in drainStep2Rows, Ping #1 in processEventsRow and drainLocalRow
    - packages/orchestrator/src/orchestrator.test.ts - TBA tests for events and local pipelines, Task 2 test fixes

key-decisions:
  - "TBA re-audit reuses existing audit-drain tick (every 5m + 60s jitter) — no new scheduler job per D-10"
  - "Ping #1 condition: verdict.prize_cash_inr === null && verdict.dates === null — fires before prize gate, geo classification, or domain resolution"
  - "Ping #2 expired checked before confirmed — an event with past date is expired even if prize/date are now known"
  - "Keep-TBA updates include deadlines: { tba: true } so the 48h loop continues correctly"

patterns-established:
  - "TBA scan: page size 50, filter deadlines.tba=true && updated < 48h ago, sort by updated"
  - "Terminal conditions guarantee loop termination: confirmed → tba=false, expired → tba=false + tombstone"

requirements-completed: [EVT-03, EVT-04, EVT-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: Local DK/Udupi offline events route to #📍-local-dk-udupi regardless of prize size
    requirement: EVT-03
    verification:
      - kind: unit
        ref: packages/orchestrator/src/orchestrator.test.ts#DK/Udupi offline event routes to #📍-local-dk-udupi regardless of prize size
        status: pass
    human_judgment: false
  - id: D2
    description: Out-of-town offline events with selection round and organizer_score >= 5 route to #✈️-travel-curated; walk-in low-effort tombstoned
    requirement: EVT-04
    verification:
      - kind: unit
        ref: packages/orchestrator/src/orchestrator.test.ts#out-of-town offline with selection round routes to #✈️-travel-curated
        status: pass
    human_judgment: false
  - id: D3
    description: TBA events fire Ping #1 to #⏳-early-tba-radar, re-audit every 48h, Ping #2 on confirmation or expiry
    requirement: EVT-06
    verification:
      - kind: unit
        ref: packages/orchestrator/src/tba-loop.test.ts#tbaReauditScan
        status: pass
      - kind: unit
        ref: packages/orchestrator/src/orchestrator.test.ts#events TBA verdict → Ping #1 routes to #⏳-early-tba-radar
        status: pass
    human_judgment: false

# Metrics
duration: 60min
completed: 2026-10-17
status: complete
---

# Phase 06 Plan 02: Local/Travel/TBA Routing Summary

**Location-primary geo classification routes local DK/Udupi events to #📍-local-dk-udupi regardless of prize size, quality out-of-town events with selection rounds to #✈️-travel-curated, and the TBA two-ping 48h re-audit loop tracks unresolved events until Ping #2 fires on confirmation or expiry.**

## Performance

- **Duration:** 60 min
- **Started:** 2026-10-17T00:00:00Z
- **Completed:** 2026-10-17T01:00:00Z
- **Tasks:** 3 completed
- **Files modified:** 4

## Accomplishments

- Task 1 (tracer): Local pipeline routing — `rule-packs/local.ts` created with `LocalVerdictSchema`, `parseLocalVerdict`, and `buildLocalMessages`; orchestrator `drainLocalRow` implements location-primary geo classification (DK/Udupi offline → #📍-local-dk-udupi regardless of prize; out-of-town offline + selection round → #✈️-travel-curated; walk-in → tombstone; online → prize gate)
- Task 2 (auto): Travel-curated routing — quality gate `organizer_score >= 5` for travel-curated admission; `walk_in_rejected` tombstone for out-of-town offline without selection round; travel-curated opportunities carry pipeline: 'local' and bucket_channel: '#✈️-travel-curated'
- Task 3 (auto): TBA two-ping 48h re-audit loop — `tba-loop.ts` with `tbaReauditScan` scanning `deadlines.tba=true` rows older than 48h within the existing audit-drain tick; Ping #1 fires on first TBA detection in both `processEventsRow` and `drainLocalRow`; Ping #2 fires on prize/date confirmation or event expiry; `tba` flag cleared on terminal conditions; no new scheduler job created

## Task Commits

Each task was committed atomically:

1. **Task 1: Local pipeline routing — location-primary geo classification for DK/Udupi events (tracer)** - `4cfc9cf` (feat)
2. **Task 2: Travel-curated routing — out-of-town offline with verified selection round** - `637d39d` (feat)
3. **Task 3: TBA two-ping 48h re-audit loop — Ping #1 and Ping #2** - `92b97a5` (feat)

**Plan metadata commit:** pending (this SUMMARY commit)

## Files Created/Modified

- `packages/orchestrator/src/tba-loop.ts` — TBA re-audit module (new)
- `packages/orchestrator/src/tba-loop.test.ts` — 10 unit tests for TBA re-audit (new)
- `packages/orchestrator/src/orchestrator.ts` — TBA import, TBA scan in drainStep2Rows, Ping #1 in processEventsRow and drainLocalRow (modified)
- `packages/orchestrator/src/orchestrator.test.ts` — TBA tests + Task 2 test fixes (modified)

## Decisions Made

- Followed the plan exactly as specified — all D-nnn decisions from 06-CONTEXT.md and 06-RESEARCH.md were implemented as documented
- TBA re-audit reuses the existing audit-drain tick — no new scheduler job (D-10)
- Ping #2 expired check ordered before confirmed check — an event with a past date is expired even if prize/dates are now known

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 2 travel-curated tests misclassified as TBA after Ping #1 added**
- **Found during:** Task 3 (TBA two-ping loop)
- **Issue:** Task 2 tests used `prize_cash_inr: null && dates: null` for travel-curated verdicts, which now matches the TBA check condition and fires Ping #1 instead of geo classification
- **Fix:** Added non-null `dates` to the four affected travel-curated test verdicts so they bypass the TBA check and proceed through geo classification
- **Files modified:** packages/orchestrator/src/orchestrator.test.ts
- **Verification:** All 4 travel-curated tests pass after fix
- **Committed in:** 92b97a5 (Task 3 commit)

**2. [Rule 1 - Bug] Events TBA test missing agenda_score required by EventsVerdictSchema**
- **Found during:** Task 3 (TBA two-ping loop)
- **Issue:** The "events TBA verdict" test verdict was missing `agenda_score`, which EventsVerdictSchema requires (`z.number().min(0).max(10)` without default), causing parse failure and `opportunities.create` to never be called
- **Fix:** Added `agenda_score: 5` to the test verdict
- **Files modified:** packages/orchestrator/src/orchestrator.test.ts
- **Verification:** Events TBA test passes after fix
- **Committed in:** 92b97a5 (Task 3 commit)

**3. [Rule 2 - Missing Critical] TBA keep-alive updates did not preserve deadlines.tba**
- **Found during:** Task 3 (TBA two-ping loop tests)
- **Issue:** When keeping a row on the TBA loop (UNVERIFIED, POOL_SATURATED, parse failure, still TBA), the code only updated the `updated` timestamp without including `deadlines: { tba: true }`, so the test fake could not verify `deadlines.tba` was preserved
- **Fix:** Added `deadlines: { tba: true }` to all keep-TBA update calls in tba-loop.ts
- **Files modified:** packages/orchestrator/src/tba-loop.ts
- **Verification:** All TBA keep-alive tests pass after fix
- **Committed in:** 92b97a5 (Task 3 commit)

**4. [Rule 1 - Bug] TBA confirmed check fired before expired check**
- **Found during:** Task 3 (TBA two-ping loop tests)
- **Issue:** When dates were confirmed but the event date was in the past, the "confirmed" branch fired first (status: audited) instead of the "expired" branch (status: expired, tombstone)
- **Fix:** Reordered terminal conditions — expired check now runs before confirmed check, so past-date events are always expired regardless of prize/date confirmation
- **Files modified:** packages/orchestrator/src/tba-loop.ts
- **Verification:** Ping #2 expired test passes after fix
- **Committed in:** 92b97a5 (Task 3 commit)

---
**Total deviations:** 4 auto-fixed (3 Rule 1 bugs, 1 Rule 2 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness — TBA check condition exposed latent test issues, and terminal condition ordering was a logic bug that would have caused expired events to be misclassified as confirmed. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above. All 184 orchestrator tests pass (11 test files).

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

Plan 06-02 is complete. All routing matrix capabilities (local, travel, TBA) are implemented and tested. Ready for Plan 06-03 (taste rule ingestion/application).

---

*Phase: 06-delivery-local-social-coverage*
*Completed: 2026-10-17*
