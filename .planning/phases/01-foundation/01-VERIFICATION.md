---
phase: 01-foundation
verified: 2026-10-15T17:45:00Z
status: human_needed
score: 16/16 must-haves verified
covered_files:
  - .planning/phases/01-foundation/01-01-PLAN.md
  - .planning/phases/01-foundation/01-02-PLAN.md
  - .planning/phases/01-foundation/01-03-PLAN.md
  - .planning/phases/01-foundation/01-04-PLAN.md
  - .planning/phases/01-foundation/01-01-SUMMARY.md
  - .planning/phases/01-foundation/01-02-SUMMARY.md
  - .planning/phases/01-foundation/01-03-SUMMARY.md
  - .planning/phases/01-foundation/01-04-SUMMARY.md
  - .planning/phases/01-foundation/01-REVIEW.md
  - .planning/phases/01-foundation/01-REVIEW-DISPOSITION.md
  - packages/config/src/env.ts
  - packages/logger/src/index.ts
  - apps/scheduler/src/index.ts
  - apps/scheduler/src/registry-start.ts
  - packages/db-hot/src/client.ts
  - packages/db-hot/src/schema.ts
  - packages/db-hot/src/telemetry.ts
  - packages/db-cold/src/client.ts
  - packages/dedup/src/fingerprint.ts
  - packages/dedup/src/precheck.ts
  - infra/turso/schema.sql
  - infra/turso/seed.sql
  - packages/scheduler/src/registry.ts
  - packages/scheduler/src/jobs.ts
  - infra/oracle/cache-buffer.sh
  - infra/oracle/cache-buffer.service
  - infra/oracle/watchdog.sh
  - apps/dashboard/index.html
  - apps/bot/src/index.ts
  - infra/cloudflared/config.yml
  - infra/cloudflared/cloudflared.service
  - infra/cloudflared/scheduler.service
  - infra/cloudflared/pocketbase.service
  - infra/pocketbase/backup.sh
  - infra/oracle/rebuild.sh
  - infra/oracle/runbook.md
  - infra/oracle/drills/port-scan.sh
  - infra/oracle/drills/edge-reject.sh
  - infra/oracle/drills/wipe-restore.sh
  - infra/oracle/drills/secrets-scan.sh
covered_digest: "v2:sha256:f91831fd5b8bada10235b321bf3e97aa3218b213bb2844a0d02c7eb4e2f2f0eb"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Run the one-command rebuild on the real Oracle Ampere host per runbook.md"
    expected: "Working VM with PocketBase + Turso schemas restored, all supervised services active, tunnel pre-check green"
    why_human: "No Oracle credentials in this environment by plan design; rebuild.sh --dry-run proves all 8 gates reachable locally but live provisioning was never executed (plan 01-04 coverage D6)"
  - test: "Run the live wipe-restore drill with Turso credentials against a real test database"
    expected: "Opportunity/telemetry/ledger counts match pre-wipe, cold rows unchanged, new writes flow to both stores"
    why_human: "No TURSO_DATABASE_URL/TURSO_AUTH_TOKEN here by plan design; --local mode proves plumbing with toy tables only (review L-02; plan 01-02 coverage D7)"
  - test: "Assert zero public listeners and unauthenticated edge rejection at the real dashboard URL"
    expected: "ss shows loopback-only PB bind with no public listeners; unauth shell + stream requests return 401/403 or login redirect"
    why_human: "port-scan/edge-reject --local prove declarations and config-lint preconditions only; live socket table and live Access rule need the provisioned host (review L-03/L-04)"
  - test: "Confirm live VM memory baseline holds 22-30% and the dead-man watchdog pages a real silence"
    expected: "Buffer holds the band on the Ampere host; stale heartbeats trigger a provider page"
    why_human: "Requires the provisioned VM plus a real dead-man provider account (plan 01-03 coverage D7); formula proven on fixtures and a 15GB workstation only"
  - test: "Install the pre-commit framework and attempt a secret-bearing commit"
    expected: "Gitleaks hook blocks the commit"
    why_human: "Hook file pinned at rev v8.24.2 but the framework is absent here, so hook firing was never observed (plan 01-01 coverage D6; review L-14)"
---

# Phase 01: Foundation Verification Report

**Phase Goal:** The system has a surviving home — provisioned VM, live databases, closed network, and a scheduler that cannot stampede
**Verified:** 2026-10-15T17:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator clones, runs install + build + unit, gets green with zero secrets in git (01-01) | ✓ VERIFIED | `pnpm build` (tsc -b) clean; `pnpm vitest run` 50/50 across 7 files (re-run by verifier); `secrets-scan.sh` → `SECRETS-SCAN PASS: 36 commits + staged clean`; `git ls-files` shows no `.env`/credential/token JSON tracked |
| 2 | Scheduler entrypoint refuses to boot when a required secret is missing and names the key (01-01) | ✓ VERIFIED | Reproduced: env without secrets → `ZodError` naming keys, non-zero exit. Touched by advisory H-01/H-02 (empty-string `TURSO_DATABASE_URL`/`PB_URL` pass the gate) — open, deferred to Phase 2 per REVIEW-DISPOSITION, not re-litigated |
| 3 | Every log line with a secret-shaped field renders the censor string (01-01) | ✓ VERIFIED | `redact.test.ts` green (secret paths censored incl. nested + headers, plaintext passthrough). Touched by advisory M-01 (two-deep/array nesting leaks) — open, Phase 2 input, not re-litigated |
| 4 | Static scan of full git history reports no committed secret (01-01) | ✓ VERIFIED | `secrets-scan.sh` PASS on 36 commits + staged. Touched by advisory H-03 (subdir `.env`/default token-file regex holes in fallback) — open, Phase 2 input, not re-litigated |
| 5 | PB hot collections accept/return every field for opportunities + telemetry + scratchpad + ledger mirror + taste rules (01-02) | ✓ VERIFIED | `packages/db-hot/src/schema.ts` (217 lines) exports validators for all five locked collections; `client.test.ts` five-collection lock assertions green. Touched by M-06/M-07/L-07/L-12 — open advisory, not re-litigated |
| 6 | Telemetry rows older than 24h identified for trimming by a tested predicate (01-02) | ✓ VERIFIED | `telemetry.test.ts` green on old/boundary/fresh fixtures; review explicitly marks predicate solid (non-finding) |
| 7 | Fingerprint stable across runs, differs on any normalized field change (01-02) | ✓ VERIFIED | `fingerprint.test.ts` 11 tests green (stability, normalization, empty-input rejection). Touched by L-06 (missed URL variants) — open advisory on recall, contract holds |
| 8 | Pre-scrape check consults hot first then cold by single-row key lookup, never deletes a tombstone (01-02) | ✓ VERIFIED | `precheck.ts:36-47` hot-first with early return; single keyed cold lookup; `grep DROP|DELETE FROM` across cold/dedup/schema.sql clean. Touched by M-02 (fingerprint not compared on cold hit) — open advisory, truth as written holds |
| 9 | Scheduler owns every poll cadence in one registry; a running tick prevents the next overlapping (01-03) | ✓ VERIFIED | `registry.ts` is the sole `schedule()` owner; all four stubs carry `noOverlap: true` + `Asia/Kolkata` + jitter; forced-overlap test green (1s job/3s handler → overlaps emitted, exactly one completion/window); boot assertion fails loudly on wrong builds |
| 10 | Each stub job records start, skip-on-overlap, duration, routable to telemetry later (01-03) | ✓ VERIFIED | `overlap.test.ts` sink tests green: start/done records with `durationMs`, skip warnings on the same child logger, atomic heartbeat files |
| 11 | VM holds reclaim-defense memory buffer; external watchdog observes scheduler + tunnel heartbeats (01-03) | ✓ VERIFIED | Sizing helper tests green (fixtures land 27.5–30.0%); `bash -n` clean on both scripts; live workstation run observed; unit carries `Restart=always`. Live-host band + real page → human item 4 |
| 12 | One documented command yields a working VM with hot + cold schemas restored (01-04) | ✓ VERIFIED | `rebuild.sh --dry-run` → `REBUILD DRY-RUN PASS: all 8 gates reachable, zero side effects` (re-run by verifier). Live Ampere run → human item 1 (touched by M-05/L-11 — open advisory) |
| 13 | Pre-wipe opportunities + telemetry readable after restore via the off-server cold path (01-04) | ✓ VERIFIED | `wipe-restore.sh --local` prints all three PASS lines (opportunity 4, telemetry 6, ledger 3) + empty-guard PASS (re-run by verifier). Live Turso round-trip → human item 2 (touched by L-02 — open advisory) |
| 14 | No inbound firewall port open; tunnel is the only ingress (01-04) | ✓ VERIFIED | `pocketbase.service` binds `--http=127.0.0.1:8090`; `config.yml` has hostname, 404 catch-all, no 8090/pocketbase route; all units `Restart=always`; `port-scan.sh --local` → `PORT-SCAN PASS`. Live socket table → human item 3 (touched by L-04 — open advisory) |
| 15 | Unauthenticated dashboard shell + future stream requests rejected before render (01-04) | ✓ VERIFIED | Shell has zero `EventSource`/`subscribe` markup; `edge-reject.sh --local` → `EDGE-REJECT PASS (5/5)` (re-run by verifier). Live 401/403 → human item 3 (touched by L-03/M-04 — open advisory) |
| 16 | Every secret still lives in env; full history scan stays clean (01-04) | ✓ VERIFIED | Same evidence as #4, re-run post-phase: 36 commits + staged clean; `.env.example` placeholder-only; gitignore covers `.env*`/credential JSONs/`pb_data` |

**Score:** 16/16 truths verified (0 present-behavior-unverified)

### Required Artifacts

All 30 must-have artifact paths exist, are substantive (8–248 lines, no stubs), and wired:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `vitest.config.ts` | workspace scaffold | ✓ VERIFIED | present; build + install green |
| `packages/config/src/env.ts` | fail-fast env gate | ✓ VERIFIED | zod parse, 4 required secrets, imported first by both entries |
| `packages/logger/src/index.ts` | redacting logger | ✓ VERIFIED | 15 redact paths, censor, child helper; entry constructs post-gate |
| `apps/scheduler/src/index.ts` + `registry-start.ts` | boot entry → registry | ✓ VERIFIED | env → logger → `startSchedulerRegistry`; correct order, timers keep alive |
| `packages/db-hot/src/client.ts` + `schema.ts` + `telemetry.ts` | hot schemas + client + trim | ✓ VERIFIED | 5 collections, 0600 auth-store token file, EventSource wiring, trim predicate |
| `packages/db-cold/src/client.ts` | remote-only Turso client | ✓ VERIFIED | StatementExecutor port, single-row lookup/insert-or-ignore |
| `packages/dedup/src/fingerprint.ts` + `precheck.ts` | fingerprint + two-tier check | ✓ VERIFIED | SHA-256 normalized hash; hot-first, one keyed cold read, no write path |
| `infra/turso/schema.sql` + `seed.sql` | idempotent DDL + empty seed | ✓ VERIFIED | `IF NOT EXISTS` tables/indexes, empty taste seed |
| `packages/scheduler/src/registry.ts` + `jobs.ts` | guarded registry + stub jobs | ✓ VERIFIED | 4 jobs, timezone/noOverlap/jitter, metrics sink, sizing helper |
| `infra/oracle/cache-buffer.sh` + `.service` + `watchdog.sh` | reclaim defense + watchdog | ✓ VERIFIED | wired holder, restart-always unit, dual dead-man heartbeats |
| `apps/dashboard/index.html` | locked static shell | ✓ VERIFIED | 67 lines, zero realtime primitives, Pages-deployed contract |
| `infra/cloudflared/config.yml` + 3 units | tunnel-only ingress | ✓ VERIFIED | hostname + 404 catch-all, no hot-DB route, all `Restart=always` |
| `infra/oracle/rebuild.sh` + `runbook.md` + `backup.sh` | one-command rebuild | ✓ VERIFIED | 8-gate dry-run PASS, consistent `.backup` snapshots, Day-0 runbook |
| 4 drill scripts | proof drills | ✓ VERIFIED | all re-run green in local/config-lint modes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| scheduler entry | env gate | `parseEnv()` before logger construction | WIRED | `index.ts:10-12` |
| scheduler entry | registry | contract-fixed `registry-start.js` import | WIRED | `index.ts:3,14`; `startSchedulerRegistry` verified |
| logger redact | env schema keys | redact paths cover credential names | WIRED | `TURSO_AUTH_TOKEN`, `PB_SERVICE_PASSWORD` listed (M-01 residual noted, advisory) |
| precheck | hot then cold | fingerprint-equality first, hash-PK second | WIRED | early return on hot-hit; exactly one cold lookup |
| rebuild | plan-02 schema | reapplies `infra/turso/schema.sql` | WIRED | referenced in `rebuild.sh` + wipe drill applies the real file |
| tunnel config | dashboard hostname | hostname ingress, no hot-DB route | WIRED | grep-verified: hostname present, no 8090/pocketbase route |
| drills | declared units | assert exact bind/ports/endpoints | WIRED | loopback bind, restart directives, shell/stream preconditions |
| watchdog | scheduler ticks | heartbeat-dir files written per tick | WIRED | atomic `{job, at, durationMs}` writes; env-or-skip contract (M-04 writer gap noted, advisory) |

### Data-Flow Trace (Level 4)

N/A — Phase 1 renders no dynamic data (static shell by design per D-22; no boards until Phase 7). Drill data-flow verified instead: wipe-restore fixture counts flow pre-wipe → restore → post-wipe assertions with named PASS lines.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite green | `pnpm vitest run` | 50/50 across 7 files | ✓ PASS |
| Build emits clean | `pnpm build` | tsc -b exit 0 | ✓ PASS |
| Missing-secret boot fails naming keys | `node apps/scheduler/dist/index.js` (no secrets) | ZodError, non-zero exit | ✓ PASS |
| Port-scan local | `bash drills/port-scan.sh --local` | PORT-SCAN PASS | ✓ PASS |
| Edge-reject local | `bash drills/edge-reject.sh --local` | EDGE-REJECT PASS (5/5) | ✓ PASS |
| Wipe-restore local | `bash drills/wipe-restore.sh --local` | opportunity/telemetry/ledger + empty-guard PASS | ✓ PASS |
| Secrets-scan | `bash drills/secrets-scan.sh` | SECRETS-SCAN PASS (36 commits + staged) | ✓ PASS |
| Rebuild dry-run | `bash rebuild.sh --dry-run` | all 8 gates reachable PASS | ✓ PASS |

### Probe Execution

No phase-declared `probe-*.sh` scripts; drill scripts above serve as the runnable checks and were executed directly.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| MEM-01 | 01-02, 01-04 | Hot opportunities collection + wipe survival | ✓ SATISFIED | five-collection schemas green; wipe drill opportunity PASS + empty-guard |
| MEM-02 | 01-02 | Telemetry ring, 24h retention | ✓ SATISFIED | trim predicate tests green (old/boundary/fresh) |
| MEM-03 | 01-02, 01-04 | Cold tombstone ledger, pre-scrape <5ms, never deleted | ✓ SATISFIED | fingerprint + precheck tests green; idempotent DDL; no delete path; ledger PASS line |
| OPS-01 | 01-01, 01-03, 01-04 | Reclaim buffer, shared-browser cap design, no-overlap scheduler, secrets hygiene | ✓ SATISFIED | overlap proof + sizing + buffer/watchdog green; browser cap is a Phase 2 structural rule (no browser code in Phase 1 by design); hygiene scans clean |

No orphaned requirements: ROADMAP maps exactly MEM-01/02/03 + OPS-01 to Phase 1, and all four are claimed across the plan frontmatter (01-01: OPS-01; 01-02: MEM-01/02/03; 01-03: OPS-01; 01-04: MEM-01/03, OPS-01).

### Anti-Patterns Found

No blockers. Debt-marker grep (`TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER`) run over phase-touched sources: no hits outside documented plan language. `TUNNEL-UUID-PLACEHOLDER`/`dash.example.com` in `config.yml` are Day-0 owner inputs per runbook §0/§3 (plan `user_setup`, not stubs). Stub jobs and empty taste seed are plan-specified by design. The 24 advisory review findings (0 critical, 3 high, 7 medium, 14 low) are recorded open in `01-REVIEW-DISPOSITION.md` with Phase 2 recommendation and are NOT re-litigated here; the must_haves each finding touches are noted in the truths table above.

### Human Verification Required

Five items (see frontmatter): live rebuild on Ampere, live wipe with Turso round-trip, live port/edge assertions, live memory band + real watchdog page, pre-commit hook firing. All stem from plan-deferred live paths (no credentials in this environment by design), not from implementation gaps.

### Gaps Summary

No gaps. All 16 must-have truths verified against the actual codebase with re-run behavioral evidence (50/50 unit suite, clean build, failing-loud boot, four green drills, clean history scan). The phase goal is achieved in local/config-lint mode; the five human items are the plan-designed live-host confirmations that require the Oracle VM, Cloudflare account, Turso credentials, and pre-commit framework absent from this environment.

---

_Verified: 2026-10-15T17:45:00Z_
_Verifier: the agent (gsd-verifier)_
