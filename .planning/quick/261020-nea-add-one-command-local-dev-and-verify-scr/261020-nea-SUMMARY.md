---
phase: 261020-nea-add-one-command-local-dev-and-verify-scr
plan: 01
subsystem: infra
tags: [local-dev, pocketbase, dashboard, proxy, sse, scheduler, drills, verification]

requires: []
provides:
  - One-command local stack (`pnpm dev`) that starts PocketBase, the idempotent bootstrap, the dashboard server, the loopback dashboard proxy, and the scheduler with prefixed logs and a single process-group shutdown path
  - One-command local verification (`pnpm verify:local`) that runs every build/test gate and local drill with a PASS/FAIL summary
  - Operator documentation for the local harness, flags, first-run superuser behavior, and troubleshooting
affects: [local-development, dashboard-server, dashboard-proxy, scheduler, oracle-drills]

actuals:
  tokens: 7891
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Dev orchestrator: spawn children detached on POSIX, SIGTERM the process group, wait 5s, SIGKILL survivors, exit with the first failure code"
    - "Readiness gates: poll /api/health, /api/boards, and / until 200 before printing READY (503 is treated as not-ready)"
    - "Proxy: read apps/dashboard/index.html fresh per request; stream /api/* with flushHeaders + pipe so SSE frames are never buffered"
    - "Verification runner: sequential spawnSync steps with continue-on-failure and a final PASS/FAIL table"
    - "All new scripts use node: built-ins only; no new dependencies"

key-files:
  created:
    - scripts/dev-local.mjs
    - scripts/dev-dashboard-proxy.mjs
    - scripts/verify-local.mjs
    - docs/local-dev.md
  modified:
    - package.json

key-decisions:
  - "Owner identity resolution: non-empty process.env.ACCESS_OWNER_EMAIL, then non-empty .env value, then owner@example.com; the same resolved value is injected into both the dashboard server and the proxy so authorizeStream accepts proxied SSE"
  - "Existing pb_data is never modified at the superuser level; a credential mismatch surfaces at bootstrap instead of deleting data"
  - "Only @zod/dashboard-server is built by dev/verify; the pre-existing broken root pnpm build is neither fixed nor invoked"
  - "verify:local discovers drills from infra/oracle/drills/*.sh and excludes browser-soak.sh unless --soak is passed"

requirements-completed: []

duration: ~10min
completed: 2026-10-20
status: complete
---

# Quick Task 261020-nea Summary

**The manual local-stack runbook is now two commands: `pnpm dev` boots PocketBase + seeded bootstrap + dashboard server + loopback proxy + scheduler with prefixed logs and frees all three ports on shutdown, while `pnpm verify:local` runs 12 build/test/drill gates and reports a single PASS/FAIL summary**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-10-20 16:54 (local)
- **Completed:** 2026-10-20 17:05 (local)
- **Tasks:** 3/3
- **Files created/modified:** 5 (885 lines added)

## Commands added

```json
"dev": "node scripts/dev-local.mjs",
"dev:local": "node scripts/dev-local.mjs",
"verify:local": "node scripts/verify-local.mjs"
```

Existing `build`, `test`, `dev:scheduler`, and `start:scheduler` are unchanged; no
dependencies were added.

## Accomplishments

- `scripts/dev-local.mjs` performs preflight checks (Node ≥ 22, `pnpm`, PocketBase
  on PATH, `.env`, and free ports 8090/3000/8080), creates the superuser only when
  `pb_data/data.db` is absent, waits on PocketBase health, runs the idempotent
  bootstrap with `--seed` (unless `--no-seed`), builds only
  `@zod/dashboard-server`, then starts the dashboard server, proxy, and scheduler
  with `[pb]`/`[dashboard]`/`[proxy]`/`[scheduler]` line prefixes and a
  `READY → http://127.0.0.1:8080` gate.
- Shutdown is reentrancy-guarded: SIGTERM to each child process group, 5s wait,
  SIGKILL survivors; unexpected child exit stops everything with a nonzero code;
  startup failures and uncaught exceptions route through the same path.
- `scripts/dev-dashboard-proxy.mjs` binds loopback 8080 only, re-reads
  `apps/dashboard/index.html` per request, rewrites `https://dash.example.com` to
  the local origin, and streams `/api/*` upstream with the owner header injected
  and no buffering.
- `scripts/verify-local.mjs` runs the dashboard build, root tests, dashboard-server
  tests, db-hot scripts typecheck, seven local drills, and the rebuild dry-run,
  then prints every step as PASS/FAIL with seconds and exits 1 on failure.
- `docs/local-dev.md` documents prerequisites, quickstart, ports, first-run
  superuser behavior, flags, verification, troubleshooting, and the loopback-only
  security boundary (including process-argument visibility during superuser
  creation).

## Task Commits

1. **Task 1: Add the local dashboard proxy and one-command dev orchestrator** — `825ccd8` (feat)
2. **Task 2: Add verify:local, package scripts, and local-dev docs** — `35f000f` (feat)
3. **Task 3: Prove the one-command stack end-to-end** — no code changes (verification only)
4. **Post-verification fix: correct the `--soak` help label** — `4db7f04` (fix)

## Verification Evidence

### Syntax and package checks

- `node --check` passes for `scripts/dev-local.mjs`, `scripts/dev-dashboard-proxy.mjs`,
  and `scripts/verify-local.mjs`.
- `package.json` assertions pass: the three new scripts match exactly, `build`
  remains `tsc -b tsconfig.json`, and `git diff` shows only the three added lines.

### `pnpm verify:local` — 12/12 PASS

```
PASS     0.8s  build @zod/dashboard-server
PASS    18.5s  test (root)                     (72 files, 709 tests)
PASS     1.7s  test @zod/dashboard-server       (4 files, 42 tests)
PASS     1.0s  typecheck @zod/db-hot scripts
PASS     0.0s  drill: edge-reject.sh
PASS     0.0s  drill: gc-verify.sh
PASS     0.0s  drill: kill-cloudflared.sh
PASS     0.1s  drill: port-scan.sh
PASS     1.4s  drill: secrets-scan.sh           (239 commits, staged clean)
PASS     0.0s  drill: tunnel-restart-recovery.sh
PASS     0.1s  drill: wipe-restore.sh
PASS     0.0s  rebuild.sh --dry-run

12 passed, 0 failed
```

`--help` exits 0 and lists all steps; an unknown flag exits 2.

### End-to-end smoke

- READY line: `READY → http://127.0.0.1:8080`
- Dashboard HTML: `<h1>Zod Telemetry</h1>` present and
  `data-boards-url="http://127.0.0.1:8080/api/boards"` rewritten.
- `/api/boards`: 8 tabs / 11 rows —
  `events-local:1, events-travel:1, events-online:1, tba-queue:1, jobs-sys:1,
  jobs-general:1, loot:1, audit-log:4`.
- SSE through the proxy: `data: {"type":"connected","ts":1792495955643}` (no manual
  headers).
- Log prefixes: `[pb]`, `[dashboard]`, `[proxy]`, `[scheduler]`, and
  `scheduler boot ok` all present.
- SIGINT cleanup: all of 8090, 3000, and 8080 free afterwards; the dashboard
  logged `stream server shut down gracefully`.
- Real terminal Ctrl-C (PTY test writing `0x03`): child exited status 0 and all
  three ports were free.

## Deviations from Plan

### 1. [Rule 3 - Harness limitation] The setsid smoke's SIGINT target misses dev-local

- **Found during:** Task 3
- **Issue:** Under `setsid pnpm dev` (no TTY), the setsid-group leader is pnpm's
  version-manager wrapper. pnpm starts `node scripts/dev-local.mjs` in a nested
  process group, so the plan's `kill -INT -- -$DEV_PID` reaches only the wrapper.
  The wrapper does not forward the signal in a non-TTY session, so the stack's
  functional assertions pass but the ports remain held and the final
  `test -z "$(sport)"` fails.
- **Evidence:** process tree showed `pnpm dev` (PGID = its own PID) and
  `node scripts/dev-local.mjs` (a different PGID). Signalling the outer group left
  8090/3000/8080 listening; signalling dev-local's actual group shut the stack down
  cleanly (`[dev] stopping services...`, dashboard graceful shutdown, ports free).
- **Closest safe checks run instead (no source change needed):**
  1. **Real PTY Ctrl-C** (`pty.fork` + write `0x03`): child exited status 0 and all
     three ports were free — this is the documented user flow.
  2. **Full smoke with SIGINT to dev-local's group:** READY, HTML rewrite,
     8 tabs/11 rows, SSE `connected`, all log prefixes, and port cleanup all PASS.
- **Product impact:** none for the documented `pnpm dev` + Ctrl-C flow; the
  limitation is in the non-TTY `setsid` harness's signal targeting.
- **Files modified:** none.

### 2. [Rule 1 - Cosmetic] Corrected the `--soak` label in `verify:local --help`

- **Found during:** Task 3 (help-output check)
- **Issue:** The help text said `(drill 7)`, but with 12 base steps the soak is an
  extra step after the rebuild dry-run.
- **Fix:** Label now reads `(extra step after rebuild)`.
- **Commit:** `4db7f04`

## Known Stubs

None.

## Scope and Safety Confirmation

- No new npm dependencies; all three scripts import only `node:` built-ins.
- `.env` was not edited (mtime unchanged from before the task).
- `pb_data/` was not deleted, reinitialized, or manually edited. The smoke's
  documented `--seed` bootstrap idempotently updated the 7 existing opportunity
  seeds and 3 telemetry seeds — expected dev behavior, not a manual data edit.
- Pre-existing uncommitted files (`.gsd/dispatch-isolation-sentinel.json`,
  `.planning/milestone.lock`, Phase 07 artifacts, and other planning files) were
  not modified or committed.
- The broken root `pnpm build` was neither fixed nor invoked.
- README.md remains unchanged.

## Self-Check: PASSED

- `scripts/dev-local.mjs`, `scripts/dev-dashboard-proxy.mjs`,
  `scripts/verify-local.mjs`, and `docs/local-dev.md` exist.
- Commits `825ccd8`, `35f000f`, and `4db7f04` exist in `git log`.
- `package.json` contains exactly the three added script entries and no dependency
  changes.
