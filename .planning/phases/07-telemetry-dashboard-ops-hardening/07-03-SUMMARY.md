---
phase: 07-telemetry-dashboard-ops-hardening
plan: 03
subsystem: telemetry-dashboard
tags: [kill-tests, gc, telemetry, alerts, sse, dashboard, secrets, hardening]
wave: 3

# Dependency graph
requires:
  - phase: 07-telemetry-dashboard-ops-hardening
    plan: 02
    provides: @zod/dashboard-server stream app (SSE /api/stream + boards /api/boards on 127.0.0.1:3000), SseHub, dashboard/index.html vanilla JS EventSource client, gc-midnight-purge job registered in scheduler registry
provides:
  - infra/oracle/drills/kill-cloudflared.sh — kill-test proving pipelines keep running + dashboard-only outage + alert drain on cloudflared kill
  - infra/oracle/drills/gc-verify.sh — kill-test proving GC purge on schedule + tombstones/taste rules survive + idempotent re-run + telemetry counts
  - infra/oracle/drills/tunnel-restart-recovery.sh — kill-test proving tunnel recovery + SSE reconnect + queued ops alert drain
  - apps/dashboard-server/src/gc.ts — runMidnightGc: purgeExpiredHeavyText + telemetry event (purged/compacted/errors) + last-success tracking + 25h-missing alert
  - apps/dashboard-server/src/alerts.ts — sendOpsAlert resolving #🛠-ops-health via DISCORD_CHANNEL_OPS_HEALTH env-ID-first with name fallback
  - apps/dashboard/index.html — staleness banner (STALENESS_THRESHOLD_MS), exponential backoff + jitter reconnect, viewer cap ~2 (SSE_VIEWER_CAP)
  - packages/config/src/env.ts — DISCORD_CHANNEL_OPS_HEALTH, STALENESS_THRESHOLD_MS, SSE_VIEWER_CAP, GC_ALERT_HOURS via parseEnv + .env.example bijection
  - packages/discord-router/src/router-service.ts — #🛠-ops-health added to CHANNEL_ID_ENV_KEYS (D-15)
affects:
  - 08+ (future phases building on ops-hardened dashboard + GC observability)
  - Wave 4 (any phase depending on drill scripts passing in local mode)

# Actuals (#2632) — pairs with the plan's estimate (42000 tokens) to calibrate future estimates.
# Same scale: chars/4 over the realized diff (65080 chars across 11 files), never a harness token count.
actuals:
  tokens: 16270
  tasks: 2
  commits: 2
  plan_head_before: f37a23636d6769422959f519a80984cdf7cb27bb
  plan_head_after: dbcc1844554fe68b3b478f9d6f473940d8f3914e

# Tech tracking
tech-stack:
  added: []
  patterns: [drill scripts following edge-reject.sh --local config-lint pattern, GC telemetry event with counts + 25h alert, ops-health channel env-ID-first resolution, client staleness banner + backoff + jitter + viewer cap, .env.example bijection for new env keys]

key-files:
  created:
    - infra/oracle/drills/kill-cloudflared.sh — tunnel-death kill-test drill
    - infra/oracle/drills/gc-verify.sh — GC purge kill-test drill
    - infra/oracle/drills/tunnel-restart-recovery.sh — tunnel recovery kill-test drill
    - apps/dashboard-server/src/gc.ts — GC telemetry + 25h-missing alert
    - apps/dashboard-server/src/alerts.ts — #🛠-ops-health alert dispatch
    - apps/dashboard-server/src/gc.test.ts — GC telemetry tests (TDD RED)
    - apps/dashboard-server/src/alerts.test.ts — ops-health alert tests (TDD RED)
  modified:
    - apps/dashboard/index.html — staleness banner threshold + backoff + jitter + viewer cap ~2
    - packages/config/src/env.ts — 4 new Phase 7 env keys with .env.example bijection
    - packages/discord-router/src/router-service.ts — #🛠-ops-health channel in CHANNEL_ID_ENV_KEYS
    - .env.example — 4 new Phase 7 env keys (bijection with EnvSchema)

key-decisions:
  - "GC 25h alert threshold defaults to 25h (GC_ALERT_HOURS env key), configurable via env"
  - "Staleness banner threshold defaults to 90000ms (STALENESS_THRESHOLD_MS env key), ~6 missed 15s heartbeats"
  - "Viewer cap defaults to 2 (SSE_VIEWER_CAP env key), rejecting extra concurrent streams with a clear message"
  - "Exponential backoff starts at 1s, jitter up to +1s, max 30s, resets on successful message"
  - "Drill scripts use --local config-lint mode proving preconditions without cloud credentials, following edge-reject.sh pattern"
  - "runMidnightGc sendAlert defaults to a no-op returning false; production wires sendOpsAlert via dependency injection"

requirements-completed: [DSH-01, DSH-04, MEM-05]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: Three kill-test drill scripts pass --local config-lint mode (tunnel death, GC verify, tunnel recovery)
    requirement: DSH-01, DSH-04, MEM-05
    verification:
      - kind: automated
        ref: infra/oracle/drills/kill-cloudflared.sh --local, gc-verify.sh --local, tunnel-restart-recovery.sh --local
        status: pass
    human_judgment: false
  - id: D2
    description: GC telemetry event with counts (purged/compacted/errors) + 25h-missing alert + #🛠-ops-health dispatch
    requirement: MEM-05, DSH-01
    verification:
      - kind: unit
        ref: apps/dashboard-server/src/gc.test.ts#runMidnightGc (8 tests), apps/dashboard-server/src/alerts.test.ts#sendOpsAlert (6 tests)
        status: pass
    human_judgment: false
  - id: D3
    description: Client staleness banner + exponential backoff + jitter reconnect + viewer cap ~2
    requirement: DSH-04
    verification:
      - kind: unit
        ref: apps/dashboard/index.html (client-side SSE logic, covered by visual/manual verification)
        status: unknown
    human_judgment: true
    rationale: Client-side DOM/SSE behavior in static HTML requires browser-based UAT; no test harness for vanilla JS EventSource client
  - id: D4
    description: Secrets hygiene — no tokens in code or logs; .env.example bijection with EnvSchema
    requirement: DSH-01
    verification:
      - kind: automated
        ref: packages/config/src/env-drift.test.ts (bijection), grep secret tokens in apps/dashboard-server/src and apps/dashboard/index.html
        status: pass
    human_judgment: false

# Metrics
duration: 50min
completed: 2026-10-17
status: complete
---

# Phase 07 Plan 03: Ops Hardening — Kill-Tests + GC Telemetry + 25h Alert + Ops-Health + Client Hardening + Secrets Hygiene

**Three kill-test drill scripts under infra/oracle/drills/ pass --local config-lint mode; GC telemetry event with counts + 25h-missing alert wired; #🛠-ops-health Discord alerts via env-ID-first resolution; dashboard client staleness banner + exponential backoff + jitter reconnect + viewer cap ~2; secrets hygiene clean with .env.example bijection.**

## Performance

- **Duration:** 50 min
- **Started:** 2026-10-17T18:03:00Z
- **Completed:** 2026-10-17T19:33:47Z
- **Tasks:** 2/2 completed
- **Files modified:** 11 files (7 created, 4 modified)

## Accomplishments

### Task 1: Kill-tests drill scripts (tunnel death + GC verify + tunnel recovery)

- `kill-cloudflared.sh` — asserts pipelines keep running when cloudflared is killed (scheduler + Discord + scrapers are tunnel-independent), dashboard-only outage (SSE unreachable while pipelines unaffected), alerts queue and drain on restart. 5/5 preconditions pass in --local mode.
- `gc-verify.sh` — asserts GC purge runs on schedule (IST midnight + jitter), clears only description_raw/detail heavy-text columns, retains tombstone_ledger + taste_rules rows, idempotent re-run, emits telemetry event with counts. 5/5 preconditions pass in --local mode.
- `tunnel-restart-recovery.sh` — asserts cloudflared restart recovers tunnel, SSE stream reconnects, queued ops alerts drain to #🛠-ops-health. 5/5 preconditions pass in --local mode.
- All scripts follow the proven edge-reject.sh pattern: set -euo pipefail, --local config-lint mode + live mode, REPO_DIR resolution from script location.

### Task 2: GC telemetry + 25h alert + ops-health alerts + staleness banner + reconnect backoff + viewer cap + secrets hygiene (TDD)

- `gc.ts` — `runMidnightGc()` composes `purgeExpiredHeavyText` + emits telemetry event with counts (purged/compacted/errors) + tracks last successful GC run time + raises 25h-missing alert if GC hasn't succeeded within GC_ALERT_HOURS (default 25h). Idempotent: re-running on already-purged rows is a no-op.
- `alerts.ts` — `sendOpsAlert(text)` resolves #🛠-ops-health via DISCORD_CHANNEL_OPS_HEALTH env-ID-first with exact-name fallback; returns false on failure (never throws); no secrets logged or embedded in alert text.
- `index.html` — staleness banner driven by STALENESS_THRESHOLD_MS (default 90000ms) with ~15s heartbeat; exponential backoff + jitter reconnect starting at 1s capped at 30s; viewer cap ~2 (SSE_VIEWER_CAP) with clear "stream limit reached" message.
- `env.ts` — 4 new keys added via parseEnv: DISCORD_CHANNEL_OPS_HEALTH, STALENESS_THRESHOLD_MS, SSE_VIEWER_CAP, GC_ALERT_HOURS, all with defaults. `.env.example` bijection verified by env-drift tests.
- `router-service.ts` — #🛠-ops-health added to CHANNEL_ID_ENV_KEYS for env-ID-first resolution (D-15).
- TDD: RED→GREEN→REFACTOR followed; gc.test.ts (8 tests) + alerts.test.ts (6 tests) all pass. Full dashboard-server suite: 42/42 pass. Config suite: 24/24 pass (including env-drift bijection).

## Task Commits

Each task was committed atomically:

1. **Task 1: Kill-tests drill scripts** - `6481dda` (feat)
2. **Task 2: GC telemetry + 25h alert + ops-health + staleness banner + backoff + viewer cap + secrets hygiene** - `dbcc184` (feat)

## Files Created/Modified

- `infra/oracle/drills/kill-cloudflared.sh` - Tunnel-death kill-test drill (--local config-lint + live mode)
- `infra/oracle/drills/gc-verify.sh` - GC purge kill-test drill (--local config-lint + live mode)
- `infra/oracle/drills/tunnel-restart-recovery.sh` - Tunnel recovery kill-test drill (--local config-lint + live mode)
- `apps/dashboard-server/src/gc.ts` - GC telemetry + 25h-missing alert + last-success tracking
- `apps/dashboard-server/src/alerts.ts` - #🛠-ops-health alert dispatch via env-ID-first resolution
- `apps/dashboard-server/src/gc.test.ts` - GC telemetry unit tests (8 tests, TDD RED)
- `apps/dashboard-server/src/alerts.test.ts` - Ops-health alert unit tests (6 tests, TDD RED)
- `apps/dashboard/index.html` - Staleness banner threshold + backoff + jitter + viewer cap ~2
- `packages/config/src/env.ts` - 4 new Phase 7 env keys via parseEnv
- `packages/discord-router/src/router-service.ts` - #🛠-ops-health in CHANNEL_ID_ENV_KEYS
- `.env.example` - 4 new Phase 7 env keys (bijection with EnvSchema)

## Decisions Made

- GC 25h alert threshold defaults to 25h via GC_ALERT_HOURS env key, configurable without code change
- Staleness banner threshold defaults to 90000ms (~6 missed 15s heartbeats) via STALENESS_THRESHOLD_MS env key
- Viewer cap defaults to 2 concurrent SSE streams via SSE_VIEWER_CAP env key
- Exponential backoff starts at 1s, jitter up to +1s, max 30s, resets on successful message
- Drill scripts use --local config-lint mode proving preconditions without cloud credentials
- runMidnightGc sendAlert defaults to a no-op; production wires sendOpsAlert via dependency injection

## Deviations from Plan

None - plan executed exactly as written. All three drill scripts pass --local mode; all TDD tests follow RED→GREEN→REFACTOR; env bijection verified.

**Total deviations:** 0 auto-fixed
**Impact on plan:** N/A

## Issues Encountered

- TDD test callbacks needed `async` keyword for `await runMidnightGc(...)` calls — fixed by marking test functions async.
- Alerts name-fallback test required the ops-health channel object to be a shared reference (not recreated per `values()` call) so the same `send` mock is asserted.
- GC test first-run-after-reset correctly raises 25h alert (never succeeded = 25h gap); test updated to verify no alert on second run within threshold.
- `tsc --noEmit` shows pre-existing `@zod/*` module resolution errors (vitest path aliases resolve these; tsc does not) — these exist in index.ts before this plan and are not introduced by this work.

## User Setup Required

None - no external service configuration required. Drill scripts have live modes requiring DASHBOARD_URL/GC_RUN_URL env vars for real-host verification, but --local config-lint mode is fully self-contained.

## Next Phase Readiness

- All Wave 3 ops-hardening deliverables complete and committed
- Drill scripts ready for live-mode execution on real host (DASHBOARD_URL, GC_RUN_URL, STREAM_URL env vars)
- GC telemetry + 25h alert provides observability for midnight GC failures
- #🛠-ops-health channel configured for GC summaries/failures, tunnel up/down, watchdog heartbeats
- Client hardening (staleness banner, backoff, viewer cap) bounds SSE cost per Pitfall 13
- Secrets hygiene verified: no tokens in code or logs; .env.example bijection with EnvSchema

---
*Phase: 07-telemetry-dashboard-ops-hardening*
*Completed: 2026-10-17*

## Self-Check: PASSED

All 11 changed/new files verified present on disk. Both commits (6481dda Task 1, dbcc184 Task 2) verified in git history. Commit count measured: 2 (`git rev-list --count f37a2363..HEAD`). All drill scripts pass --local mode. All 42 dashboard-server tests pass. All 24 config tests pass (including env-drift bijection).
