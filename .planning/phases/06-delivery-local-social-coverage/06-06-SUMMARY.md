---
phase: 06-delivery-local-social-coverage
plan: 06
subsystem: auth
tags: [discord, taste-ingestion, authorization, allowlist, operator, CR-04, G-06-2, MEM-04]

# Dependency graph
requires:
  - phase: 06-delivery-local-social-coverage/06-05
    provides: OPERATOR_USER_IDS defined in EnvSchema (packages/config/src/env.ts)
provides:
  - OPERATOR_USER_IDS allowlist enforcement on Path 2 (keyword command) taste-rule handler
affects:
  - 06-delivery-local-social-coverage/06-07
  - taste-rules feedback path (MEM-04)

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 1088
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Shared OPERATOR_USER_IDS allowlist Set across Path 2 (keyword) and Path 3 (DM) handlers — single source of truth
    - Fail-closed on empty OPERATOR_USER_IDS (default '') — no operators authorized when unset

key-files:
  created: []
  modified:
    - packages/discord-router/src/taste-ingest.ts — Path 2 keyword handler allowlist check (CR-04/G-06-2)
    - packages/discord-router/src/taste-ingest.test.ts — Path 2 authorization tests + existing test author.id fix

key-decisions:
  - "Reuse Path 3's OPERATOR_USER_IDS Set (built at handler scope) for Path 2, keeping both paths on one allowlist"
  - "Fail-closed: empty OPERATOR_USER_IDS rejects all keyword !rule commands"

requirements-completed: [MEM-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Operator allowlist check on Path 2 keyword !rule taste-ingestion handler — rejects non-operators with reply, accepts operators (source 'keyword'), fail-closed when OPERATOR_USER_IDS empty"
    requirement: MEM-04
    verification:
      - kind: unit
        ref: "packages/discord-router/src/taste-ingest.test.ts — taste ingestion handler (22 tests pass)"
        status: pass
    human_judgment: false

# Metrics
duration: 3 min
completed: 2026-10-17
status: complete
---

# Phase 06 Plan 06: Operator allowlist check for keyword taste-rule commands Summary

**OPERATOR_USER_IDS operator allowlist enforced on Path 2 (keyword command) taste-rule handler — only operators listed in OPERATOR_USER_IDS can create system-wide taste rules via `!rule` in #🧠-bot-training-chat; all others are rejected with a reply and no taste rule is created.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-17T07:47:00Z
- **Completed:** 2026-10-17T07:49:33Z
- **Tasks:** 1 completed
- **Files modified:** 2

## Accomplishments

- Closed gap G-06-2 (CR-04): Path 2 keyword `!rule` handler now checks `OPERATOR_USER_IDS.has(msg.author.id)` before creating any taste rule
- Unauthorized user in training channel → rejected with '❌ You are not authorized to create taste rules.', no `pb.create` call
- Authorized operator → rule created with `source: 'keyword'` plus confirmation reply
- Empty OPERATOR_USER_IDS → fail-closed, all keyword `!rule` rejected
- Path 2 and Path 3 share the same `OPERATOR_USER_IDS` allowlist Set
- All 22 taste-ingest tests pass (vitest)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add operator allowlist check to Path 2 keyword command handler in taste-ingest.ts** - `0c8aea3` (fix)

**Plan metadata:** `0c8aea3` (docs: complete plan — this plan has a single task, so no separate docs commit beyond the SUMMARY below)

## Files Created/Modified

- `packages/discord-router/src/taste-ingest.ts` - Added Path 2 keyword-command allowlist check reusing the handler-scoped `OPERATOR_USER_IDS` Set
- `packages/discord-router/src/taste-ingest.test.ts` - Added tests for unauthorized rejection, authorized operator creation (source 'keyword'), and empty-allowlist fail-closed; updated existing WEIGHT keyword test to mark author as operator (`id: 'op-123'`)

## Decisions Made

- Reused Path 3's handler-scoped `OPERATOR_USER_IDS` Set for Path 2 rather than rebuilding it, keeping both ingestion paths on one allowlist (single source of truth, consistent with plan 06-05)
- Fail-closed on empty `OPERATOR_USER_IDS` (default `''`) — no operators authorized when the env var is unset

## Deviations from Plan

None - plan executed exactly as written. The only adjustment was updating the existing WEIGHT keyword test's `author` to include `id: 'op-123'` so it represents an authorized operator under the new check; this is required for "all existing tests continue to pass" and is within the task scope, not added scope.

## Issues Encountered

- The existing keyword `!rule` test (and the WEIGHT keyword test) constructed `msg.author` without an `id`. After adding `OPERATOR_USER_IDS.has(msg.author.id)`, `undefined` is not in the allowlist, so those tests would fail. Fixed by setting `author.id: 'op-123'` (an authorized operator in `testEnv`) on both. No production-code impact.

## Threat Flags

None — the allowlist check implements the modeled mitigation T-6-13 (CR-04/G-06-2); no new network endpoints, auth paths, file access, or schema changes at trust boundaries were introduced.

## Known Stubs

None — all code paths are fully wired with real data sources; no placeholder/mock data flows to rendering.

## Next Phase Readiness

- Taste-rule authorization is now enforced on both ingestion paths (Path 2 keyword + Path 3 DM), satisfying MEM-04 / CR-02 / CR-04
- Ready for 06-07 (next phase plan)

---
*Phase: 06-delivery-local-social-coverage*
*Completed: 2026-10-17*

## Self-Check: PASSED

- Source files exist: taste-ingest.ts, taste-ingest.test.ts
- SUMMARY.md exists: .planning/phases/06-delivery-local-social-coverage/06-06-SUMMARY.md
- Commit exists: 0c8aea3
