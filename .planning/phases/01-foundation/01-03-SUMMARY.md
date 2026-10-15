---
phase: 01-foundation
plan: "03"
subsystem: infra
tags: [node-cron, scheduler, noOverlap, jitter, reclaim-defense, watchdog, systemd, dead-man-switch]

# Dependency graph
requires:
  - phase: 01-01
    provides: [fail-fast env gate, redacting pino logger, scheduler entry boot contract]
provides:
  - Single scheduler registry owning all four guarded stub jobs (Asia/Kolkata, noOverlap, per-job jitter)
  - Forced-overlap proof test plus tick metrics sink and buffer-sizing helper
  - Reclaim-defense wired-cache buffer script + restart-always systemd unit
  - Dual-heartbeat dead-man silence watchdog script
affects: [01-04-network-rebuild, scraper-foundation, llm-swarm, telemetry]

# Actuals (#2632) — same chars/4 scale as the plan estimate
actuals:
  tokens: 9516
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: [node-cron 4.6.0 (registry specifier, never the kelektiv/* git shorthand)]
  patterns: [single registry owning every schedule() call, structural TickLogger injection, env-plumbed dead-man watchdog, tested sizing formula mirrored in shell]

key-files:
  created: [packages/scheduler/package.json, packages/scheduler/src/jobs.ts, packages/scheduler/src/registry.ts, packages/scheduler/src/overlap.test.ts, packages/scheduler/src/globals.d.ts, packages/scheduler/vitest.config.ts, apps/scheduler/src/registry-start.ts, infra/oracle/cache-buffer.sh, infra/oracle/cache-buffer.service, infra/oracle/watchdog.sh]
  modified: [apps/scheduler/src/index.ts, apps/scheduler/package.json, apps/scheduler/tsconfig.json, tsconfig.json, pnpm-lock.yaml]

key-decisions:
  - "Library package named @zod/scheduler-registry: apps/scheduler already owns the @zod/scheduler name and pnpm refuses duplicate workspace names"
  - "TickLogger is structural (info/warn/child), not a pino import: production passes the pino child logger, tests inject a memory fake with zero secrets"
  - "Sizing helper lives in jobs.ts (not a new file): the plan's files_modified list is the file budget, so reclaim math ships beside the tick code with a cross-reference to cache-buffer.sh"
  - "Heartbeat writes are env-or-skip (SCHEDULER_HEARTBEAT_DIR): dev/test write nothing by default; plan 04 sets the env when it supervises the scheduler"
  - "Default dead-man ping provider: healthchecks.io-compatible ping URLs via WATCHDOG_*_URL env (UptimeRobot heartbeat URLs interchangeable, zero code change)"

patterns-established:
  - "Registry owns every schedule(): future pipeline code registers jobs here; setInterval and ad-hoc schedules are prohibited"
  - "Boot guard probe: schedule a far-future noOverlap task and assert .on/.start/.stop/.destroy so a wrong scheduler build fails loudly at boot"
  - "Heartbeat files are atomic (tmp+rename) {job, at, durationMs} and best-effort: write failure warns, tick continues, watchdog observes staleness"
  - "Watchdog pages on silence, never on content: fresh channel pings the dead-man URL, stale channel exits 3 without pinging"

requirements-completed: [OPS-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Single registry registering four stub jobs with Asia/Kolkata, noOverlap, and per-job jitter; entry boots env-parse -> logger -> registry start"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "packages/scheduler/src/overlap.test.ts#registry registers four guarded stub jobs"
        status: pass
      - kind: unit
        ref: "packages/scheduler/src/overlap.test.ts#boot assertion"
        status: pass
      - kind: other
        ref: "pnpm build (tsc -b) + node apps/scheduler/dist/index.js prints boot line and stays alive on cron timers; without secrets exits 1 naming keys"
        status: pass
    human_judgment: false
  - id: D2
    description: "Forced-overlap proof: 1s job with 3s handler skips concurrent ticks with exactly one completion per window"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "packages/scheduler/src/overlap.test.ts#forced overlap proof (D-27)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tick metrics sink records start/done with durationMs; heartbeat file written per tick for the watchdog"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "packages/scheduler/src/overlap.test.ts#stub tick metrics sink"
        status: pass
    human_judgment: false
  - id: D4
    description: "Buffer sizing helper computes holds keeping baseline inside the 22-30% band on fixtures"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "packages/scheduler/src/overlap.test.ts#buffer sizing helper"
        status: pass
    human_judgment: false
  - id: D5
    description: "Reclaim buffer script sizes from actual memory and holds wired RAM under supervision"
    requirement: "OPS-01"
    verification:
      - kind: other
        ref: "bash -n clean; live run on 15GB box computed hold=0 (already 51% busy, ceiling clamp correct); fake 10GiB meminfo with 16MiB override held resident (RSS observed, timeout-killed as expected)"
        status: pass
      - kind: other
        ref: "systemd-analyze verify clean on path-substituted copy (repo copy references the VM install path /opt/zod, placed by plan-04 rebuild)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Watchdog pings dead-man URL on fresh heartbeats, exits stale without pinging, for scheduler and tunnel channels"
    requirement: "OPS-01"
    verification:
      - kind: other
        ref: "bash -n clean; scheduler fresh-heartbeat run pinged file:// URL exit 0; empty dir exit 3 with no ping; tunnel without unit exit 3; missing URL and bad mode exit non-zero"
        status: pass
    human_judgment: false
  - id: D7
    description: "Live VM behavior: buffer holds the 22-30% baseline on the real Ampere host and the watchdog pages a real silence"
    verification: []
    human_judgment: true
    rationale: "Requires the provisioned Oracle VM plus a real dead-man provider account; live memory assertions run under plan 04 rebuild on the real host per the plan's verification note"

# Metrics
duration: 9min
completed: 2026-10-15
plan_head_before: edf2087dfbfa1cd1e2c55b30338787521b6a2014
plan_head_after: ddcdd42a0fc9d40307ce4790e37a5fa93fe9a087
status: complete
---

# Phase 01 Plan 03: Scheduler Plus Reclaim-Defense Summary

**Single node-cron registry with four noOverlap stub jobs (Asia/Kolkata + per-job jitter), a forced-overlap test proving skips, tick metrics with watchdog heartbeats, and a supervised 2.5GiB wired-cache buffer with dead-man silence alerting.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-15T09:21:57Z
- **Completed:** 2026-10-15T09:30:34Z
- **Tasks:** 2 (1 registry + 1 TDD reclaim slice)
- **Files modified:** 16

## Accomplishments

- One registry owns every `schedule()` call: events-stub `*/20` + 5m jitter, jobs-stub `*/45` + 10m, local-stub `0 */3` + 20m, social-stub `0 * * * *` + 25m — all with `Asia/Kolkata`, `noOverlap: true`, overlap-skip warnings on the same child logger
- Boot guard fails loudly on a wrong scheduler build (missing schedule/validate, missing overlap-event API, rejected stub expression)
- Forced-overlap drill green: 1s job with 3s handler emitted overlaps with exactly one completion per window (~3.5s)
- Every tick records start/done with `durationMs` to the injected sink and writes an atomic `{job, at, durationMs}` heartbeat file for the watchdog
- Buffer sizing helper + shell script derive the hold from actual memory: `min(2.5GiB, free-512MiB, 30%-ceiling-headroom)`; fixtures land 27.5–30.0% baseline
- `cache-buffer.service` (`Restart=always`) supervises the wired holder; `watchdog.sh` sends dual dead-man heartbeats (scheduler file-age, tunnel file/systemd) and pages by silence

## Task Commits

Each task was committed atomically:

1. **Task 1: Single scheduler registry with four stub jobs** — `ed38c3a` (feat: registry + jobs + entry wiring + registration/guard tests)
2. **Task 2: Forced-overlap proof plus reclaim buffer and watchdog** — `ddcdd42` (feat: TDD behavior tests + sink/heartbeat/sizing + buffer + watchdog)

**Plan metadata:** this SUMMARY commit follows (docs: complete plan).

## Files Created/Modified

- `packages/scheduler/package.json` — `@zod/scheduler-registry`, `node-cron@^4.6.0` registry specifier, dist main/types/exports contract
- `packages/scheduler/src/jobs.ts` — `STUB_JOBS` table, `TickLogger` shape, `runStubTick` (logging + sink + heartbeat), `MetricsSink`/`TickRecord`, `computeBufferHoldMiB` + band constants
- `packages/scheduler/src/registry.ts` — `assertSchedulerGuards`, `registerStubJobs`, `startRegistry` with `RegisterOptions`
- `packages/scheduler/src/overlap.test.ts` — 13 tests: registration values, boot-guard failures, forced overlap, sink, heartbeat, sizing
- `packages/scheduler/src/globals.d.ts` — minimal Node shims (no `@types/node`, same precedent as 01-01)
- `packages/scheduler/tsconfig.json`, `packages/scheduler/vitest.config.ts` — composite build + scheduler test project
- `apps/scheduler/src/registry-start.ts` — contract-fixed `@zod/scheduler-registry` import, `startSchedulerRegistry(log)`
- `apps/scheduler/src/index.ts` — boot order env parse → logger → registry start; process stays alive on cron timers
- `apps/scheduler/package.json` — workspace dep on registry; dev is `tsx watch`, prod is compiled emit
- `infra/oracle/cache-buffer.sh` — memory-derived wired holder (executable)
- `infra/oracle/cache-buffer.service` — `Restart=always` supervision unit
- `infra/oracle/watchdog.sh` — dual dead-man silence watchdog (executable)
- `tsconfig.json`, `apps/scheduler/tsconfig.json`, `pnpm-lock.yaml` — project references + resolved node-cron 4.6.0

## Decisions Made

- Library package named `@zod/scheduler-registry`: `apps/scheduler` already owns the `@zod/scheduler` name and pnpm refuses duplicate workspace names — the registry specifier is what matters, not the package name.
- `TickLogger` structural instead of importing pino: production passes the real pino child logger (verified assignable by `tsc`), tests inject a memory fake with zero secrets and no env singleton.
- Sizing helper lives in `jobs.ts`, not a new file: the plan's `files_modified` list is the file budget, so reclaim math ships beside tick code with a cross-reference comment to `cache-buffer.sh`.
- Social cadence `0 * * * *` (top of hour) instead of the research sketch `*/60 * * * *`: identical firing instants, unambiguous to future readers.
- Heartbeat writes are env-or-skip (`SCHEDULER_HEARTBEAT_DIR`): dev/test configure nothing; plan 04 sets the env when it supervises the scheduler on the VM.
- Default dead-man ping provider (agent's discretion, per plan): healthchecks.io-compatible ping URLs via `WATCHDOG_SCHEDULER_URL` / `WATCHDOG_TUNNEL_URL`; UptimeRobot heartbeat URLs are interchangeable with zero code change. URLs are env-only and never echoed (the scripts log only that a ping happened).
- Tunnel liveness prefers a `tunnel.heartbeat` file but falls back to `systemctl is-active cloudflared`: the plan-04 cloudflared supervision owns the writer; until then the fallback keeps the check meaningful.

## Buffer Size Derivation (required by plan, agent's discretion)

`hold = min(2560 MiB, free − 512 MiB, ⌊30% × total − used⌋)`, floored at 0. Rationale: 2.5 GiB is the D-25 lock; the margin never eats the last 512 MiB of free RAM; the ceiling clamp keeps `used + hold ≤ 30%` so the buffer itself cannot push the box out of band. Fixtures: `[10240, 9984] → 2560 → 27.5%`; `[6144, 5632] → 1331 → 30.0%`; `[4096, 3900] → 1032 → 30.0%`; tight box `[4096, 100] → 0` (holds nothing; watchdog silence-alerting still covers reclaim). Live check on this workstation (15 GiB, already 51% busy): computed hold 0 via the ceiling clamp and slept — the formula refuses to add load to a busy box. The shell script mirrors this formula exactly (`CACHE_BUFFER_MEMINFO` seam exists for fixture-driven testing); change both together.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Named the library package @zod/scheduler-registry instead of reusing @zod/scheduler**
- **Found during:** Task 1 (new `packages/scheduler/package.json` vs existing `apps/scheduler` name)
- **Issue:** The plan's file list creates `packages/scheduler/package.json`, but `apps/scheduler` (plan 01-01) already owns the `@zod/scheduler` workspace name — pnpm refuses two packages with one name, so the plan-as-literally-named cannot install.
- **Fix:** Library ships as `@zod/scheduler-registry`; the entry imports it through the contract-fixed `@zod/*` workspace specifier. All plan file paths unchanged.
- **Files modified:** `packages/scheduler/package.json`, `apps/scheduler/src/registry-start.ts`
- **Verification:** `pnpm install` + `pnpm build` green; committed in `ed38c3a`.

**2. [Rule 3 - Blocking] Added tsc project-reference and dependency wiring not in the plan's file list**
- **Found during:** Task 1 (`tsc -b` could not resolve `@zod/scheduler-registry`)
- **Issue:** New package needs the dist main/types/exports contract (01-01 convention), root + app tsconfig references, the workspace dep, and `tsx watch` for the mandated dev-only watch mode — none listed in the plan.
- **Fix:** Added the exports contract, both tsconfig references, the `workspace:*` dep, `dev: tsx watch src/index.ts`; edited `index.ts` to call `startSchedulerRegistry(log)` (the plan's own action mandates the wiring).
- **Files modified:** `packages/scheduler/package.json`, `tsconfig.json`, `apps/scheduler/tsconfig.json`, `apps/scheduler/package.json`, `apps/scheduler/src/index.ts`
- **Verification:** `pnpm build` emits all four dist trees; boot line + 24/7 stay-alive proven; committed in `ed38c3a`.

**3. [Rule 3 - Blocking] Added minimal Node-globals shim instead of installing @types/node**
- **Found during:** Task 2 (`process`, `setTimeout`, `node:fs/path/os` undeclared under the approved-set ceiling)
- **Issue:** Heartbeat files and timer-based tests need Node globals, but `@types/node` is outside the approved install set.
- **Fix:** `packages/scheduler/src/globals.d.ts` with the same tiny-shim precedent as 01-01 (process env/exitCode, timers, only the fs/path/os functions used).
- **Files modified:** `packages/scheduler/src/globals.d.ts`
- **Verification:** `tsc -b` clean with no new install; committed in `ddcdd42`.

**4. [Rule 3 - Blocking] Seeded registration/guard tests in Task 1's slice of overlap.test.ts**
- **Found during:** Task 1 (its `<verify>` filters `--testNamePattern='registry registers|boot assertion'`, but the only test file lands under Task 2)
- **Issue:** Task 1's verify command matches zero tests without an early test slice.
- **Fix:** Wrote the registration + boot-assertion describes during Task 1 inside the plan-listed `overlap.test.ts`; Task 2 appended the TDD behavior describes (metrics/heartbeat/sizing failing first, then green).
- **Files modified:** `packages/scheduler/src/overlap.test.ts`
- **Verification:** Task-1 pattern run 7/7 green before commit `ed38c3a`; full file 13/13 green before `ddcdd42`.

---

**Total deviations:** 4 auto-fixed (all blocking-issue wiring, zero scope creep).
**Impact on plan:** All four required for the plan's own success criteria (installable workspace, tsc emit build, runnable verifies, TDD file placement). No architectural change, no new runtime dependency beyond the plan-mandated `node-cron@^4.6.0`.

## Issues Encountered

- `systemd-analyze verify` on the repo-copy unit file reports `ExecStart /opt/zod/cache-buffer.sh: No such file` — expected: that is the VM install path placed by the plan-04 rebuild script. Verified syntax-clean on a path-substituted copy (`UNIT_SYNTAX_OK`).
- The forced-overlap test passes on first run by construction (it proves library `noOverlap` behavior, not new code) — the genuine RED was the 4 failing metrics/heartbeat/sizing tests (`not a function`), turned green by the implementation. Full suite: 18/18 across config, logger, scheduler.
- `gsd_run` CLI is absent in this execution environment, so STATE.md / ROADMAP.md / REQUIREMENTS.md mutations were deliberately skipped — the orchestrator owns those centrally (same as 01-01).

## Known Stubs

- The four `*-stub` jobs perform no polling by plan design — real poll logic plugs into `runStubTick` Phase 2+ without structural change (plan-specified, not a gap).
- `tunnel.heartbeat` has no writer yet — the plan-04 cloudflared supervision owns it; until then `watchdog.sh tunnel` falls back to `systemctl is-active cloudflared` (fail-safe: missing file + inactive unit exits 3 with no ping, so the provider alerts).
- `SCHEDULER_HEARTBEAT_DIR` is unset until plan 04 supervises the scheduler — ticks skip heartbeat writes until then, and the watchdog treats the absence as stale (alerts, never silent-green).

## User Setup Required

None - no external service configuration required. (Day-0 owner prerequisites — dead-man provider URLs, VM placement — belong to plan 01-04 provisioning, which consumes `WATCHDOG_*_URL`, `SCHEDULER_HEARTBEAT_DIR`, and the `/opt/zod` install path defined here.)

## Next Phase Readiness

- Ready for 01-04 (network + rebuild): consumes the buffer unit path, watchdog modes, and heartbeat-dir contract defined here.
- Ready for Phase 2+ pipelines: register real poll logic in `packages/scheduler/src/jobs.ts` / `registry.ts` — never outside the registry.
- Watch item: re-verify `node-cron` 4.6.x currency before Phase 2 (research validity window noted in PATTERNS.md).
- Branch `agent-01-03-foundation` holds 2 commits over `edf2087`; orchestrator to merge and run central STATE/ROADMAP/requirements sync (OPS-01 stays shared until sibling plans land).

## Self-Check: PASSED

All 10 created key files found on disk; commits `ed38c3a` + `ddcdd42` verified in history; measured `commits: 2` from persisted ledger base `edf2087`; full suite 18/18 green; shell syntax + unit verification recorded above.

---
*Phase: 01-foundation*
*Completed: 2026-10-15*
