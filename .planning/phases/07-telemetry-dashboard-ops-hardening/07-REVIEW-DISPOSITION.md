---
phase: 07-telemetry-dashboard-ops-hardening
reviewed: 2026-10-18T00:00:00Z
source: 07-REVIEW.md
status: disposition_recorded
---

# Phase 07: Code Review Disposition

| Finding ID | Severity | Disposition | Reason |
|------------|----------|-------------|--------|
| CR-01 | critical | fixed | Stream/boards URLs now resolve from `data-stream-url`/`data-boards-url` data attributes on the script tag, falling back to relative URLs. Deploys with `data-stream-url="https://<tunnel-host>/api/stream"` connect to the VM tunnel origin per D-01. |
| CR-02 | critical | fixed | GC tickHandler now calls `runMidnightGc` from `@zod/dashboard-server/gc` with real PocketBase rows, env, log, and sendAlert callback. MEM-05 purge, 25h alert, telemetry counts, and last-success tracking are all operational in production. |
| CR-03 | critical | fixed | `GC_JOBS` added to all three `assertSchedulerGuards` test loops (cron validation, guard rejection, noOverlap+jitter). Describe block renamed to "all five job tables". |
| CR-04 | critical | fixed | `SseHub.pushDelta`/`pushHeartbeat` wrap each `client.write()` in try/catch to isolate bad sockets. Viewer cap enforced via constructor param. Connection timeout added on SSE responses. Graceful shutdown on SIGTERM/SIGINT stops hub and server. |
| WR-01 | warning | fixed | Closed by 07-FIX-WR-01 (`8e37289`): `authorizeStream()` checks the Cloudflare Access owner email on `/api/stream` before `hub.addClient`; covered by UAT #1. |
| WR-02 | warning | fixed | /api/boards now returns 503 on PocketBase upstream failure instead of silently returning empty 200. |
| WR-03 | warning | fixed | `gc.ts` now imports `parseEnv` from `@zod/config` instead of `(globalThis as any).parseEnv`. |
| WR-04 | warning | fixed | Closed by 07-FIX-WR-04: client reconnect-as-cap logic removed; server-side `SseHub` viewer cap (`SSE_VIEWER_CAP`, default 2) is the concurrent-connection bound. Covered by UAT #10. |
| WR-05 | warning | fixed | Closed by 07-FIX-WR-05: `loadBoards` renders a user-visible "Boards failed to load" message in the active board section; console.error retained as a secondary diagnostic. |
| WR-06 | warning | fixed | First successful GC run no longer raises a false-positive 25h-missing alert (`lastSuccessfulGcMs !== null` guard added). |
| WR-07 | warning | fixed | Graceful shutdown handler added for SIGTERM/SIGINT that calls `hub.stop()` and `server.close()`. |
| IN-01 | info | open | Hardcoded test credentials in vitest.config.ts - document as intentional test fakes. |
| IN-02 | info | open | Hardcoded test credentials in gc.test.ts and alerts.test.ts - document as intentional test fakes. |
| IN-03 | info | open | index.ts uses console.error instead of pino logger for boot failure. |
| IN-04 | info | open | registry-start.ts imports `cold` then `void cold`s it - acceptable tracer-slice placeholder. |
| IN-05 | info | open | `apps/dashboard-server/src/telemetry.test.ts` listed as changed but does not exist on disk - verify file list accuracy. |

**Summary:** 4 critical findings fixed, 7 warnings fixed, 0 warnings open, 5 info open. The three warnings still marked open in the original disposition (WR-01, WR-04, WR-05) were closed by the `8e37289` gap-closure commit and are recorded as fixed above.

**Next steps:** Track the five info items (IN-01 through IN-05) in the v1 debt backlog. None block phase completion. Phase verification is recorded in `07-VERIFICATION.md`; validation in `07-VALIDATION.md`.
