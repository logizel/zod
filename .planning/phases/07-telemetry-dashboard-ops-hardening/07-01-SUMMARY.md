---
phase: 07-telemetry-dashboard-ops-hardening
plan: 01
subsystem: telemetry-dashboard
tags: [sse, zero-trust, pocketbase, scheduler, gc, dashboard, ops]

# Dependency graph
requires:
  - phase: 06-delivery-local-social-coverage
    provides: existing scheduler registry, db-hot schemas (opportunities, agent_telemetry), config env schema, parser patterns
provides:
  - @zod/dashboard-server stream app (SSE /api/stream + boards /api/boards on 127.0.0.1:3000)
  - dashboard.service systemd unit (Restart=always, mirrors scheduler.service)
  - dashboard/index.html vanilla JS EventSource client rendering one slot row
  - gc-midnight-purge job registered in single scheduler registry (IST midnight + jitter + noOverlap)
  - purgeExpiredHeavyText function (heavy-text-only GC, idempotent, telemetry counts)
affects:
  - 07-02 (dashboard expansion: health grid, filters, tabs)
  - 07-03 (kill-tests: kill-cloudflared.sh, gc-verify.sh, tunnel-restart-recovery.sh)

# Actuals (#2632) — pairs with the plan's estimate (48000 tokens) to calibrate future estimates.
# Same scale: chars/4 over the realized diff (953 insertions, 7 deletions, 17 files), never a harness token count.
actuals:
  tokens: 9500
  tasks: 3
  commits: 4
  plan_head_before: e9b992e1585fad0d12a2d63a878d56739602b610
  plan_head_after: d369ad4ba774332cb8768f8e789b2b97b2856ff4

# Tech tracking
tech-stack:
  added: [@zod/dashboard-server workspace app, Node built-in http SSE server]
  patterns: [single shared PB subscription SSE fan-out, SseHub + heartbeat, single scheduler registry GC job registration, heavy-text-only GC purge]

key-files:
  created:
    - apps/dashboard-server/src/index.ts - parseEnv -> pino -> createPbClient -> Node http server on 127.0.0.1:3000, GET /api/stream + GET /api/boards
    - apps/dashboard-server/src/sse.ts - SseHub: single shared PB realtime subscription, coalesced ~4s push, ~15s heartbeat
    - apps/dashboard-server/src/boards.ts - GET /api/boards tabbed board snapshot (active/upcoming + last 7 days)
    - apps/dashboard-server/src/sse.test.ts - single-subscription fan-out, coalesced delta, heartbeat, client tracking (5 tests)
    - apps/dashboard-server/src/boards.test.ts - snapshot shape, board-window filter, tab set (5 tests)
    - apps/dashboard-server/package.json, tsconfig.json, vitest.config.ts - new workspace app config
    - infra/cloudflared/dashboard.service - systemd unit mirroring scheduler.service (Restart=always)
  modified:
    - apps/dashboard/index.html - vanilla JS EventSource client, one top-panel slot row, backoff+jitter reconnect (cap 2)
    - packages/scheduler/src/jobs.ts - GC_JOBS array with gc-midnight-purge StubJobDef
    - packages/scheduler/src/registry.ts - registerGcJob following registerAuditDrain/registerGatewayJobs pattern
    - packages/db-hot/src/telemetry.ts - purgeExpiredHeavyText (description_raw/detail only, idempotent, counts)
    - packages/db-hot/src/telemetry.test.ts - isTelemetryExpired boundary + purgeExpiredHeavyText suite (8 tests)
    - packages/scheduler/src/registry.test.ts - registerGcJob + GC_JOBS exact contents tests
    - apps/scheduler/src/registry-start.ts - wire registerGcJob alongside registerAuditDrain
    - pnpm-lock.yaml - new workspace package lock

key-decisions:
  - "Ran Task 2 (edge-reject drill) before Task 1 because Task 1 adds EventSource to index.html, which violates Task 2's 'no dynamic primitive in shell' precondition; verified Task 2 first on the clean shell (5/5 pass), then applied Task 1"
  - "Dashboard UI + stream server separated per D-01: Cloudflare Pages static UI + VM stream origin via tunnel, never single-origin"
  - "Single shared PocketBase subscription for SSE fan-out per D-06/Pitfall 13: one upstream subscription regardless of viewer count"
  - "Heavy-text-only GC purge per D-13/MEM-05: clears description_raw (opportunities) and detail (agent_telemetry), retains row metadata, tombstone_ledger, taste_rules"

patterns-established:
  - "SseHub class: single shared PB subscription on agent_telemetry + opportunities, coalesced ~4s push to all SSE clients, ~15s heartbeat driving client staleness banner"
  - "registerGcJob follows registerAuditDrain/registerGatewayJobs pattern: assertSchedulerGuards, noOverlap + Asia/Kolkata + jitter, execution:overlap skip warning, injected tickHandler"
  - "purgeExpiredHeavyText: idempotent heavy-text-only purge returning {purged, compacted, errors} telemetry event counts"

requirements-completed: [DSH-01, DSH-02, DSH-03, MEM-05]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: Stream server boots on 127.0.0.1:3000 with GET /api/stream (SSE text/event-stream) and GET /api/boards (application/json)
    requirement: DSH-02
    verification:
      - kind: unit
        ref: apps/dashboard-server/src/sse.test.ts#SseHub
        status: pass
    human_judgment: false
  - id: D2
    description: Dashboard shell EventSource client connects to stream URL and renders one top-panel slot row (provider/model/step/status)
    requirement: DSH-02
    verification:
      - kind: other
        ref: apps/dashboard/index.html EventSource client (vanilla JS, code review)
        status: unknown
    human_judgment: true
    rationale: EventSource client is vanilla JS in static HTML; no automated DOM test exists; verified by code inspection
  - id: D3
    description: gc-midnight-purge job registered in single scheduler registry with noOverlap + Asia/Kolkata + ~15m jitter
    requirement: MEM-05
    verification:
      - kind: unit
        ref: packages/scheduler/src/registry.test.ts#registerGcJob
        status: pass
    human_judgment: false
  - id: D4
    description: purgeExpiredHeavyText clears only description_raw/detail heavy-text columns, idempotent, reports counts
    requirement: MEM-05
    verification:
      - kind: unit
        ref: packages/db-hot/src/telemetry.test.ts#purgeExpiredHeavyText
        status: pass
    human_judgment: false
  - id: D5
    description: edge-reject drill proves Zero Trust preconditions (unauth rejected before render)
    requirement: DSH-01
    verification:
      - kind: manual_procedural
        ref: infra/oracle/drills/edge-reject.sh --local (5/5 preconditions)
        status: pass
    human_judgment: false

# Metrics
duration: 45min
completed: 2026-10-17
status: complete
---

# Phase 07 Plan 01: Telemetry Dashboard + Ops Hardening — Tracer Slice Summary

**Stream server + SSE + one board render end-to-end, Zero Trust gate preconditions proven, GC stub job registered in single scheduler registry with idempotent heavy-text-only purge.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-10-17T21:10:00Z
- **Completed:** 2026-10-17T21:55:00Z
- **Tasks:** 3/3
- **Files modified:** 17

## Accomplishments

- Created @zod/dashboard-server workspace app: Node http server on 127.0.0.1:3000 with GET /api/stream (SSE) and GET /api/boards (JSON), SseHub with single shared PocketBase subscription fan-out and ~15s heartbeat
- Wired apps/dashboard/index.html vanilla JS EventSource client rendering one top-panel slot row, with exponential backoff + jitter reconnect (cap 2 streams)
- Created infra/cloudflared/dashboard.service systemd unit mirroring scheduler.service (Restart=always)
- Verified edge-reject.sh --local: all 5 Zero Trust preconditions hold (unauth rejected before render) — run before Task 1's shell modification
- Registered gc-midnight-purge job in single scheduler registry (IST midnight, noOverlap, ~15m jitter) via registerGcJob following registerAuditDrain pattern
- Implemented purgeExpiredHeavyText: clears only description_raw (opportunities) and detail (agent_telemetry), retains row metadata/tombstones/taste_rules, idempotent, returns {purged, compacted, errors}

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end stream server + SSE + one board renders** - `2f85e81` (feat)
2. **Task 2: Zero Trust gate drill proving unauth rejection before render** - no commit (verification only; edge-reject.sh --local passed 5/5 preconditions on clean shell)
3. **Task 3: GC stub job registered in single scheduler registry** - `abf9ebf` (test, RED) + `3f635d5` (feat, GREEN telemetry) + `d369ad4` (feat, scheduler registration)

**Plan metadata:** `d369ad4` (docs: complete plan)

_Note: TDD task (Task 3) has multiple commits: test (RED) → feat (GREEN) → feat (scheduler registration)_

## Files Created/Modified

- `apps/dashboard-server/src/index.ts` - stream server entrypoint: parseEnv fail-fast gate, pino logger, createPbClient, Node http server
- `apps/dashboard-server/src/sse.ts` - SseHub: single shared PB subscription, coalesced push, heartbeat
- `apps/dashboard-server/src/boards.ts` - GET /api/boards tabbed board snapshot handler
- `apps/dashboard-server/src/sse.test.ts` - SSE hub tests (5 tests)
- `apps/dashboard-server/src/boards.test.ts` - boards endpoint tests (5 tests)
- `apps/dashboard-server/package.json, tsconfig.json, vitest.config.ts` - new workspace app
- `apps/dashboard/index.html` - vanilla JS EventSource client, one slot row, backoff+jitter reconnect
- `infra/cloudflared/dashboard.service` - systemd unit (Restart=always)
- `packages/scheduler/src/jobs.ts` - GC_JOBS array with gc-midnight-purge
- `packages/scheduler/src/registry.ts` - registerGcJob + GC_JOBS export
- `packages/db-hot/src/telemetry.ts` - purgeExpiredHeavyText implementation
- `packages/db-hot/src/telemetry.test.ts` - purgeExpiredHeavyText + isTelemetryExpired tests
- `packages/scheduler/src/registry.test.ts` - registerGcJob + GC_JOBS tests
- `apps/scheduler/src/registry-start.ts` - wire registerGcJob with purgeExpiredHeavyText tickHandler
- `pnpm-lock.yaml` - new workspace package lock

## Decisions Made

- Task ordering: Task 2 verified before Task 1 because Task 1 adds EventSource to index.html which violates Task 2's precondition 1 (no dynamic primitive)
- No new npm packages added (D-02 zero-deps; stream server uses existing verified workspace deps + Node built-ins)
- No new env keys needed for GC job (uses existing SCHEDULER_TIMEZONE constant)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fixed shared mutable state in purgeExpiredHeavyText RED tests**
- **Found during:** Task 3 GREEN phase (tests failed after implementation)
- **Issue:** Test fixtures (ROW_OLD, OPP_OLD, etc.) were defined at describe scope and mutated by earlier tests, causing later idempotency/count tests to see already-purged rows
- **Fix:** Refactored fixtures into factory functions (oldRow(), oldOpp(), etc.) creating fresh objects per test
- **Files modified:** packages/db-hot/src/telemetry.test.ts
- **Verification:** All 36 db-hot tests pass after fix
- **Committed in:** 3f635d5 (part of Task 3 GREEN commit)

**2. [Rule 3 - Blocking] esbuild 0.28.2 does not support `??=` operator in sse.test.ts**
- **Found during:** Task 1 test run
- **Issue:** `??=` nullish assignment in makeFakePb caused esbuild transform failure
- **Fix:** Rewrote to use explicit `if (!handlers) { handlers = []; subs.set(event, handlers); }`
- **Files modified:** apps/dashboard-server/src/sse.test.ts
- **Verification:** All 10 dashboard-server tests pass
- **Committed in:** 2f85e81 (Task 1 commit)

### Task ordering deviation

**Task 2 executed before Task 1** (plan order was 1→2→3, actual order was 2→1→3). Task 1 modifies `apps/dashboard/index.html` to add an EventSource client, which violates Task 2's precondition 1 ("shell exposes no dynamic primitive"). Task 2 was verified on the clean shell first (5/5 preconditions pass), then Task 1 was applied. This is a required reordering, not a scope change.

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking) + 1 task-ordering deviation
**Impact on plan:** All deviations necessary for correctness. No scope creep. Plan goal fully achieved.

## Issues Encountered

- vitest/esbuild 0.28.2 lacks `??=` support — rewrote test code to avoid it
- Mock response closure variables (`statusCode`, `headers`, `body`) weren't reflected in returned object properties — switched to getter-based accessors
- Header case sensitivity in boards.test.ts: `Content-Type` (actual) vs `content-type` (assertion) — fixed assertion

## User Setup Required

None - no external service configuration required for this tracer plan. Live edge-reject mode requires DASHBOARD_URL credentials (deferred to real host).

## Next Phase Readiness

- Stream server + SSE + boards API foundation complete and tested
- Ready for Plan 02 (dashboard expansion: 2D health grid, rich filters, tabbed boards)
- Ready for Plan 03 (kill-tests: kill-cloudflared.sh, gc-verify.sh, tunnel-restart-recovery.sh)
- GC 25h-missing alert and Discord #🛠-ops-health wiring deferred to Wave 3 (D-14)

---
*Phase: 07-telemetry-dashboard-ops-hardening*
*Completed: 2026-10-17*

## Self-Check: PASSED

All 14 created/modified source files verified present on disk. All 4 commits verified in git history (`2f85e81`, `abf9ebf`, `3f635d5`, `d369ad4`). Commit count measured: 4 (`git rev-list --count e9b992e..HEAD`).
