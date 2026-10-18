---
phase: 07-telemetry-dashboard-ops-hardening
reviewed: 2026-10-18T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - apps/dashboard-server/src/index.ts
  - apps/dashboard-server/src/sse.ts
  - apps/dashboard-server/src/boards.ts
  - apps/dashboard-server/src/sse.test.ts
  - apps/dashboard-server/src/boards.test.ts
  - apps/dashboard-server/src/gc.ts
  - apps/dashboard-server/src/alerts.ts
  - apps/dashboard-server/src/gc.test.ts
  - apps/dashboard-server/src/alerts.test.ts
  - apps/dashboard-server/package.json
  - apps/dashboard-server/tsconfig.json
  - apps/dashboard-server/vitest.config.ts
  - apps/dashboard/index.html
  - infra/cloudflared/dashboard.service
  - packages/scheduler/src/jobs.ts
  - packages/scheduler/src/registry.ts
  - apps/scheduler/src/registry-start.ts
  - packages/scheduler/src/registry.test.ts
  - packages/db-hot/src/telemetry.ts
  - packages/db-hot/src/telemetry.test.ts
  - packages/config/src/env.ts
  - infra/oracle/drills/kill-cloudflared.sh
  - infra/oracle/drills/gc-verify.sh
  - infra/oracle/drills/tunnel-restart-recovery.sh
findings:
  critical: 4
  warning: 7
  info: 5
  total: 16
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-10-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Phase 07 ("Telemetry Dashboard + Ops Hardening") delivers a locked read-only dashboard with SSE stream server, tabbed boards, GC purge scheduling, kill-test drills, GC telemetry + 25h alert, ops-health Discord alerts, and client-side staleness/backoff/viewer-cap hardening.

The implementation follows the planned tracer-slice architecture and most unit tests pass. However, the adversarial review surfaced **4 Critical and 7 Warning findings**, several of which undermine the phase goal itself: the SSE client connects to the wrong origin (relative URL on a Pages+VM-tunnel split), the GC telemetry/alert feature is implemented but never wired into the production scheduler, and the GC purge operates on empty rows (permanent no-op). There is also a test-coverage gap where the scheduler guard no longer validates the newly-added GC cron expression.

No findings were reported in test files unless they affect test reliability.

## Critical Issues

### CR-01: Dashboard SSE client uses a relative stream URL — connects to wrong origin

**File:** `apps/dashboard/index.html:252-253`

**Issue:** `STREAM_URL = '/api/stream'` (and `BOARDS_URL = '/api/boards'`) are relative URLs. Per the D-01 decision and plan summaries, the architecture is "Cloudflare Pages static UI + VM stream origin via tunnel, never single-origin." A relative URL resolves against the Pages origin, not the VM tunnel origin where the SSE endpoint (`/api/stream`) and boards API live. The SSE client will never connect to the actual stream origin in production, so the core live-telemetry feature is non-functional.

**Fix:** Resolve the stream/boards URLs from an absolute tunnel origin (env-configurable or a data attribute on the shell), e.g.:

```js
const STREAM_URL = (document.currentScript?.dataset?.streamUrl) || '/api/stream';
const BOARDS_URL = (document.currentScript?.dataset?.boardsUrl) || '/api/boards';
```
Deploy with `data-stream-url="https://<tunnel-host>/api/stream"` and `data-boards-url="https://<tunnel-host>/api/boards"` on the `<script>` tag, or derive from `location.origin` when Pages and stream share a host.

---

### CR-02: GC tickHandler bypasses runMidnightGc and passes empty rows — 25h alert, telemetry, and purge are no-ops in production

**File:** `apps/scheduler/src/registry-start.ts:89-96`

**Issue:** The `gc-midnight-purge` job's `tickHandler` calls `purgeExpiredHeavyText({ agentTelemetry: [], opportunities: [] })` directly with empty arrays, completely bypassing `runMidnightGc` (which is defined in `apps/dashboard-server/src/gc.ts`). Consequences:
- The 25h-missing alert never fires in production.
- Last-successful-GC tracking never runs.
- The GC telemetry event (purged/compacted/errors) is never emitted.
- `purgeExpiredHeavyText` always operates on empty rows → permanently purges zero cells. MEM-05 heavy-text purge is not actually enforced in production.

The ops-hardening telemetry and alert surface exists but is not operational.

**Fix:** Wire `runMidnightGc` into the GC tickHandler, fetch real rows from PocketBase, and inject `sendOpsAlert`:

```ts
import { runMidnightGc, resetGcState } from '@zod/dashboard-server/gc';
import { sendOpsAlert } from '@zod/dashboard-server/alerts';
// ...
registerGcJob(log, undefined, {
  tickHandler: async (_def, jobLog) => {
    const pb = await createPbClient(env);
    const [telemetryRows, oppRows] = await Promise.all([
      pb.collection('agent_telemetry').getFullList(),
      pb.collection('opportunities').getFullList(),
    ]);
    const result = await runMidnightGc(
      { agentTelemetry: telemetryRows, opportunities: oppRows },
      Date.now(),
      { env, log: jobLog, sendAlert },
    );
    jobLog.info({ job: 'gc-midnight-purge', ...result }, 'gc-midnight-purge tick');
  },
});
```

---

### CR-03: assertSchedulerGuards test excludes GC_JOBS — new GC cron expression never validated

**File:** `packages/scheduler/src/registry.test.ts:357-378`

**Issue:** The describe block "assertSchedulerGuards covers all four job tables" claims to validate every job table against the real cron build, but its loop (line 360) iterates only `[...STUB_JOBS, ...GATEWAY_JOBS, ...JOB_POLL_JOBS, ...AUDIT_JOBS]` — `GC_JOBS` (added in Phase 07) is omitted. A malformed `gc-midnight-purge` cron expression would pass the guard and only fail at runtime. The test name is also misleading ("all four" when there are five tables including GC_JOBS).

**Fix:** Include GC_JOBS in the guard loop and rename the describe block to reflect all five tables:

```ts
for (const def of [...STUB_JOBS, ...GATEWAY_JOBS, ...JOB_POLL_JOBS, ...AUDIT_JOBS, ...GC_JOBS]) {
  expect(cron.validate(def.expression)).toBe(true);
}
```

---

### CR-04: SseHub pushDelta/pushHeartbeat call client.write() without per-client error isolation — one bad socket can abort all clients and crash the server; no server-side viewer cap or connection timeout (DoS)

**File:** `apps/dashboard-server/src/sse.ts:117-141` and `apps/dashboard-server/src/index.ts:33-67`

**Issue:** `pushDelta` and `pushHeartbeat` iterate `this.clients` and call `client.write(payload)` (i.e., `res.write`) with no `try/catch` per client. If one client's socket is closed/errored, `res.write` can throw `ERR_STREAM_WRITE_AFTER_END`; the exception propagates out of the `setInterval` callback, aborting delivery to all remaining clients and potentially crashing the Node process (uncaught exception in interval). There is also no server-side viewer cap (the ~2-stream cap exists only client-side and is mis-implemented — see WR-04), no `req.on('timeout')`, and no socket `setTimeout`, so stalled connections are never reaped. Combined, this is a denial-of-service / availability risk that contradicts Pitfall 13 (bound SSE cost) and D-08 (viewer cap).

**Fix:** Isolate writes per client and enforce a server-side viewer cap with connection timeouts:

```ts
private pushDelta(): void {
  const payload = ...;
  for (const client of this.clients) {
    try { client.write(payload); } catch { /* isolate: one bad client must not deny others */ }
  }
}
// In start() / addClient(): enforce SSE_VIEWER_CAP; close & reject beyond cap.
// Add: req.setTimeout(...); res.setTimeout(...); req.on('timeout', ...)
```

## Warnings

### WR-01: /api/stream SSE endpoint has no application-layer auth (relies solely on Cloudflare Access edge)

**File:** `apps/dashboard-server/src/index.ts:35-47`

**Issue:** The SSE endpoint writes `text/event-stream` with no auth check at the application layer. The code comment asserts "Zero Trust Access already rejected unauth at the edge." This is a defense-in-depth gap: if Cloudflare Access is misconfigured, the tunnel is bypassed, or the origin is reached directly, the telemetry stream (which may carry bucket states, slot info, and audit hints) is publicly readable.

**Fix:** Add an application-layer authorization check on `/api/stream` (e.g., verify the Cloudflare Access JWT/email header present at the edge), or at minimum document that the origin must not be directly reachable. Prefer defense-in-depth: reject unauthenticated requests before `hub.addClient`.

---

### WR-02: /api/boards swallows PocketBase errors and returns 200 with empty data

**File:** `apps/dashboard-server/src/index.ts:53-58`

**Issue:** If PocketBase is unreachable or `getFullList` throws, the `catch` silently sets `rows = []` and `handleBoards` returns a 200 with an empty board. Clients cannot distinguish "no opportunities" from "database down," masking infrastructure failure as empty data.

**Fix:** Return a 503/500 on upstream failure so clients and monitoring can detect the outage:

```ts
} catch {
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'upstream unavailable' }));
  return;
}
```

---

### WR-03: gc.ts uses `(globalThis as any).parseEnv` type hole

**File:** `apps/dashboard-server/src/gc.ts:57`

**Issue:** `env = opts.env ?? (globalThis as any).parseEnv ?? undefined` uses an `any` cast on `globalThis`. If `opts.env` is not provided and no global `parseEnv` exists, `env` is `undefined` (guarded at line 62), but this is a type-safety anti-pattern and obscures the env dependency.

**Fix:** Import `parseEnv` from `@zod/config` and require `env` as an explicit option, or pass `env` through from the caller:

```ts
import { parseEnv } from '@zod/config';
const env = opts.env ?? parseEnv();
```

---

### WR-04: Index.html "viewer cap" counts reconnects, not concurrent viewers — does not actually cap concurrent streams

**File:** `apps/dashboard/index.html:266-314`

**Issue:** `SSE_VIEWER_CAP = 2` is implemented as `if (reconnects > SSE_VIEWER_CAP) { show 'stream limit reached'; return; }`. `reconnects` counts reconnect *attempts* on a single EventSource, not concurrent viewers. A single flaky client locks itself out after ~3 failed reconnects, while the implementation does nothing to limit the number of concurrent SSE connections to the server. The cap is mislabeled and ineffective at its stated purpose (bound concurrent stream cost per Pitfall 13/D-08).

**Fix:** Either enforce a real concurrent-connection cap server-side (see CR-04) or rename to `MAX_RECONNECT_ATTEMPTS` and track actual concurrent clients on the server.

---

### WR-05: Index.html boards-fetch errors are silently swallowed (console.error only), no user-visible error state

**File:** `apps/dashboard/index.html:382-388`

**Issue:** `loadBoards`' `.catch` only logs to the console. When the boards endpoint returns 400 (invalid filters) or 503 (upstream down), the user sees no error — the board simply stops updating with no indication why.

**Fix:** Render a user-visible error banner/message in the `.catch` handler so filter/validation failures are surfaced.

---

### WR-06: gc.ts first-ever successful run always raises a 25h-missing alert (false positive)

**File:** `apps/dashboard-server/src/gc.ts:65-96`

**Issue:** On the first successful GC run after state reset, `lastSuccessfulGcMs === null` → `msSinceLastSuccess = Infinity` → `alertNeeded = true`, so a "25h-missing alert" is raised even though GC just succeeded. The test at `gc.test.ts:104` encodes this as expected behavior, but semantically it is a false positive that will create unnecessary alert noise on first boot/reset.

**Fix:** Only raise the alert when there was a previous successful run that has gone stale; skip the alert on the very first successful run:

```ts
const alertNeeded = lastSuccessfulGcMs !== null && msSinceLastSuccess > gcAlertHours * 60 * 60 * 1000;
```

---

### WR-07: No graceful shutdown for the SSE hub — intervals keep the event loop alive on SIGTERM

**File:** `apps/dashboard-server/src/index.ts:69` and `apps/dashboard-server/src/sse.ts:109-115`

**Issue:** `server.listen(3000, ...)` starts the SSE hub timers (`setInterval` push + heartbeat), but there is no `process.on('SIGTERM'/'SIGINT')` handler that calls `server.close()` and `hub.stop()`. On systemd `Restart=always` shutdown (SIGTERM then SIGKILL), the running intervals keep the event loop alive, delaying process exit and risking hard SIGKILL kills. `SseHub.stop()` also clears timers and clients but never unsubscribes from the PocketBase realtime subscriptions, so a restarted hub accumulates duplicate subscriptions.

**Fix:** Add graceful-shutdown handling that calls `hub.stop()` (and unsubscribes from PB) and `server.close()` on SIGTERM/SIGINT before process exit.

## Info

### IN-01: Hardcoded test credentials in vitest.config.ts

**File:** `apps/dashboard-server/vitest.config.ts:16-24`

**Issue:** Test secrets are hardcoded (`test-password`, `test-token`, `test-groq-key`, etc.). These are clearly fake test fixtures, but they contradict the "no tokens in code" secrets-hygiene claim and would fail a naive secrets scan.

**Fix:** Document these as intentional test fakes or source them from a `.env.test` file excluded from the repo.

### IN-02: Hardcoded test credentials in gc.test.ts and alerts.test.ts

**File:** `apps/dashboard-server/src/gc.test.ts:54-64`; `apps/dashboard-server/src/alerts.test.ts:12-23`

**Issue:** Same as IN-01 — `requiredEnv` objects contain fake secrets (`s3cret`, `t0ken`, `groq-test`, `discord-test`). Fake values, but flagged for consistency with secrets hygiene.

**Fix:** Mark as test-only fixtures or move to a test env file.

### IN-03: index.ts uses console.error instead of the pino logger

**File:** `apps/dashboard-server/src/index.ts:74`

**Issue:** Boot failure is logged via `console.error('stream server boot failed', err)` while the rest of the service uses structured pino logging. Inconsistent log shape (plain text vs JSON) hurts log aggregation/telemetry parity.

**Fix:** Replace with `log.error({ err }, 'stream server boot failed')` (logger is available in `main` scope).

### IN-04: registry-start.ts imports `cold` then marks it intentionally unused (`void cold`)

**File:** `apps/scheduler/src/registry-start.ts:102-103`

**Issue:** `const cold = clientExecutor(turso);` is created and then neutralized with `void cold` with a comment that it's "intentionally unused in this tracer slice." This is dead code in production until the Turso cold path is wired (noted as pending for 05-05 merger).

**Fix:** Acceptable as a tracer-slice placeholder; remove or wire the cold store when the Turso path is activated.

### IN-05: File listed as changed but absent on disk

**File:** `apps/dashboard-server/src/telemetry.test.ts`

**Issue:** The Phase 07 file list includes `apps/dashboard-server/src/telemetry.test.ts (new)`, but the file does not exist on disk (confirmed via directory listing). The dashboard-server test files present are `sse.test.ts`, `boards.test.ts`, `gc.test.ts`, and `alerts.test.ts`. This is a file-scope/planning discrepancy, not a source defect.

**Fix:** Either create `telemetry.test.ts` if it was intended, or correct the file list / SUMMARY so downstream scope tooling (e.g., `--auto` re-review) is not misled.

---

## Integration Notes (cross-plan file overlaps)

`boards.ts`, `sse.ts`, and `index.html` were each modified across Plans 01 → 02 → 03. These are intentional accumulations (filters/board-window in plan 02; staleness banner/backoff/viewer-cap in plan 03) and no conflicting edits were found. The one real integration gap is cross-plane: plan 03's client-side viewer cap (`index.html`) assumes server-side enforcement that `sse.ts`/`index.ts` (plans 01/02) do not provide (see CR-04/WR-04).

## Recommended Fix Order

1. CR-01 (relative URL) — core feature non-functional in production architecture
2. CR-02 (GC not wired / empty rows) — MEM-05 and 25h alert non-operational
3. CR-03 (GC_JOBS excluded from guard) — false sense of scheduler safety
4. CR-04 (SseHub write isolation + viewer cap) — availability/DoS risk
5. WR-01 through WR-07 — hardening and correctness
6. IN-01 through IN-05 — hygiene and scope accuracy

---

_Reviewed: 2026-10-18T00:00:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
