---
phase: 01-foundation
plan: "04"
subsystem: infra
tags: [pocketbase, cloudflared, zero-trust, systemd, rebuild, drills, backup, edge-reject, secrets-hygiene]

# Dependency graph
requires:
  - phase: 01-foundation plan 01
    provides: [pnpm workspace, zod env gate, redacting logger, tsc project-reference build]
  - phase: 01-foundation plan 02
    provides: [five locked collection schemas, Turso idempotent schema.sql + empty seed, mocked-proof baseline]
  - phase: 01-foundation plan 03
    provides: [single scheduler registry, wired-cache buffer unit, dual-heartbeat dead-man watchdog]
provides:
  - Locked static dashboard shell + bot skeleton wired into the workspace build
  - Supervised tunnel + scheduler + loopback-only database units (all Restart=always)
  - One-command rebuild (checksum-verified ARM64 server, loud restore, schema reapply, unit install, pre-checks)
  - Nightly consistent-backup script plus four proof drills (port-scan, edge-reject, wipe-restore, secrets-scan)
affects: [phase-7-telemetry-dashboard, scraper-foundation, llm-swarm, events-slice]

# Actuals (#2632) — same chars/4 scale as the plan estimate
actuals:
  tokens: 12004
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [static-shell-behind-edge-wall, tunnel-only-ingress, loopback-only-hot-db, checksum-verified-binary-provision, sqlite-backup-never-raw-copy, named-abort-on-empty-restore, assembled-pattern-secret-scan]

key-files:
  created: [apps/bot/package.json, apps/bot/src/index.ts, apps/dashboard/index.html, apps/dashboard/package.json, infra/cloudflared/config.yml, infra/cloudflared/cloudflared.service, infra/cloudflared/scheduler.service, infra/cloudflared/pocketbase.service, infra/pocketbase/backup.sh, infra/oracle/rebuild.sh, infra/oracle/runbook.md, infra/oracle/drills/port-scan.sh, infra/oracle/drills/edge-reject.sh, infra/oracle/drills/wipe-restore.sh, infra/oracle/drills/secrets-scan.sh]
  modified: [apps/bot/tsconfig.json, tsconfig.json, pnpm-lock.yaml]

key-decisions:
  - "Task 1 version verdict (Option B, operator-selected): PocketBase server v0.40.5 (2026-10-08, Go net/http DoS fix) — explicit pick of newer-release-over-locked-line; rebuild downloads exactly pocketbase_0.40.5_linux_arm64.zip with aarch64 assert + published-checksum verify; fallback to locked v0.35.0 (0.35.0) with printed evidence, no extra round-trip"
  - "Cloud credentials absent by plan design: all drills prove in local/config-lint mode; live assertions deferred to the real host (no blocking)"
  - "Backup off-server target (agent's discretion): local snapshots are the guarantee under BACKUP_DIR; PB_BACKUP_REMOTE (aws s3 / rclone) is the optional bonus, never required for PASS"
  - "Dead-man provider (inherited from 01-03): healthchecks.io-compatible ping URLs via WATCHDOG_*_URL; UptimeRobot interchangeable with zero code change"

patterns-established:
  - "Shell proves criterion 3 statically: zero realtime primitives in markup, tunnel catch-all 404, owner-only edge rule — edge-reject drill lints all three"
  - "Rebuild never skips loudly: missing arch/checksums/creds/services abort with REBUILD-ABORT naming the cause; first-provision empty data dir gets an explicit marker, never a silent empty boot"
  - "Wipe drill asserts both stores plus the guard: opportunity/telemetry/ledger PASS lines, then the empty-source self-test proving the MEM-01 residual abort"
  - "Secret-scan fallback assembles patterns by concatenation so the drill can never flag its own committed source"

requirements-completed: [MEM-01, MEM-03, OPS-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Locked static shell + tunnel config + three supervised units to contract (no stream markup, hostname present, no hot-DB route, Restart=always, loopback bind)"
    requirement: "OPS-01"
    verification:
      - kind: other
        ref: "plan Task 2 verify verbatim (shell grep empty + 3x Restart=always + hostname + no 8090 route) — TASK2_VERIFY_PASS"
        status: pass
      - kind: other
        ref: "node apps/bot/dist/index.js with secrets prints boot line exit 0, without secrets exits 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "One-command rebuild passes dry-run locally with all 8 gates reachable and zero side effects"
    requirement: "OPS-01"
    verification:
      - kind: other
        ref: "bash infra/oracle/rebuild.sh --dry-run — REBUILD DRY-RUN PASS (8 gates), exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Simulated wipe preserves opportunity + telemetry counts and leaves cold ledger rows intact, with new writes flowing to both stores"
    requirement: "MEM-01"
    verification:
      - kind: other
        ref: "bash infra/oracle/drills/wipe-restore.sh --local — opportunity/telemetry/ledger PASS lines + empty-guard PASS"
        status: pass
    human_judgment: false
  - id: D4
    description: "Zero public listeners proven at declaration and socket level; edge-reject preconditions lint clean"
    requirement: "OPS-01"
    verification:
      - kind: other
        ref: "bash infra/oracle/drills/port-scan.sh --local — PORT-SCAN PASS, exit 0"
        status: pass
      - kind: other
        ref: "bash infra/oracle/drills/edge-reject.sh --local — EDGE-REJECT PASS (5/5), exit 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full history + staged secret scan clean; cold-ledger survival path (MEM-03) exercised through the real schema file"
    requirement: "MEM-03"
    verification:
      - kind: other
        ref: "bash infra/oracle/drills/secrets-scan.sh — SECRETS-SCAN PASS (30 commits + staged), exit 0"
        status: pass
      - kind: other
        ref: "wipe-restore --local applies infra/turso/schema.sql to fixture cold ledger + idempotent reapply"
        status: pass
    human_judgment: false
  - id: D6
    description: "Live-host proofs: rebuild on Ampere, unauth edge reject at the real URL, live wipe with Turso round-trip, tunnel egress"
    requirement: "OPS-01"
    verification: []
    human_judgment: true
    rationale: "Requires the provisioned Oracle VM + Cloudflare account + Turso credentials, absent in this environment by plan design; scripts carry the live paths with fail-loud guards and the runbook documents the exact live invocations"

# Metrics
duration: 12min
completed: 2026-10-15
plan_head_before: ed7fc96231cee829465bba12ad31d2445bbdd81b
plan_head_after: b0e408a8b220fe6c9f86ce9a723075048bc41801
status: complete
---

# Phase 01 Plan 04: Closed Network Plus Rebuild Proof Summary

**Supervised tunnel + loopback-only database units behind a static locked shell, one checksum-verified rebuild command with nightly consistent backups, and four drills proving wipe survival, zero open ports, edge rejection, and clean secret history — all green in local modes.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-15T11:21:39Z
- **Completed:** 2026-10-15T11:33:02Z
- **Tasks:** 3 (1 version gate via operator verdict + 2 auto)
- **Files modified:** 17 (15 created, 2 build-wiring modified)

## Task 1 — PocketBase server version gate (blocking-human, operator-resolved)

The operator selected **Option B**: server **`v0.40.5`** (2026-10-08,
includes the Go `net/http` denial-of-service fix) — an explicit pick of
**newer-release-over-locked-line**. Rationale (per verdict): greenfield
upgrade is free (no data/migration cost), takes the upstream-advised
security fix, avoids Phase 7 inheriting the older line; JS SDK 0.28 supports
server 0.29+ so drift risk is bounded. `rebuild.sh` downloads exactly
`pocketbase_0.40.5_linux_arm64.zip`, asserts `uname -m == aarch64` before any
download, and verifies against the release's published checksums file
(`checksums.txt`, then `SHA256SUMS`). **Fallback rule honored in code:** a
missing asset, checksum failure, or real SDK-0.28-vs-server-0.40
incompatibility falls back to the locked `v0.35.x` line (`0.35.0`) with the
evidence printed — recorded here, no extra human round-trip. No fallback was
needed locally (dry-run proves the paths without downloading).

## Accomplishments

- Static shell + tunnel + units to contract: shell carries zero realtime
  primitives, tunnel config has the dashboard hostname with a 404 catch-all
  and no hot-DB route, all three units declare `Restart=always`, the database
  unit binds `127.0.0.1:8090` only
- Bot skeleton boots through the same env-parse → logger order with no
  gateway code, wired into `tsc -b` + lockfile; full suite stays 50/50 green
- Rebuild dry-run passes with all 8 gates reachable (arch, checksum-verified
  download + fallback, restore-or-loud-init, Turso reapply, cloudflared
  provision, unit + timer install, service assertion, tunnel pre-check)
- Wipe-restore proves criterion 2 in simulation: opportunity/telemetry/
  ledger PASS lines plus the empty-source named-abort self-test (MEM-01
  residual: never a silent empty boot)
- Port-scan, edge-reject, and secrets-scan all PASS in local modes with exit
  0; live paths stay in-script behind fail-loud guards for the real host

## Task Commits

Each task was committed atomically:

1. **Task 1: Version gate** — no code commit (operator Option B verdict recorded here in SUMMARY per done criteria)
2. **Task 2: Locked static shell with supervised tunnel and service units** — `6183ca4` (feat: shell + bot + tunnel config + 3 units + build wiring; 11 files)
3. **Task 3: One-command rebuild with backup and four proof drills** — `b0e408a` (feat: rebuild + backup + runbook + 4 drills + unit-path fix; 8 files)

**Plan metadata:** SUMMARY commit follows (docs: complete plan).

## Files Created/Modified

- `apps/dashboard/index.html` — static locked shell (no stream/board markup, Pages-deployed, Access-gated)
- `apps/dashboard/package.json` — static-shell package (no deps, no build step by design)
- `apps/bot/package.json` + `apps/bot/src/index.ts` — skeleton entry (env-parse → logger → boot line, no gateway)
- `apps/bot/tsconfig.json` + `tsconfig.json` + `pnpm-lock.yaml` — build wiring (composite ref, workspace importers)
- `infra/cloudflared/config.yml` — tunnel UUID + credentials path, dashboard hostname → future origin, 404 catch-all, no hot-DB route
- `infra/cloudflared/cloudflared.service` — canonical unit, explicit `--config` (no sudo-home mismatch)
- `infra/cloudflared/scheduler.service` — installed as `zod-scheduler.service`, compiled emit at the built checkout, heartbeat dir set
- `infra/cloudflared/pocketbase.service` — installed as `zod-pocketbase.service`, `--http=127.0.0.1:8090 --dir /vol/pb_data`
- `infra/pocketbase/backup.sh` — nightly `.backup` snapshot + retention + optional remote sync, never raw copy
- `infra/oracle/rebuild.sh` — the one command (`--dry-run` clean, 8 live gates, v0.40.5 + locked-line fallback)
- `infra/oracle/runbook.md` — Day-0 prerequisites, version log, path map, Access spec, rotation, drill matrix
- `infra/oracle/drills/port-scan.sh` — loopback-bind assertion over `ss`, live requires the bind
- `infra/oracle/drills/edge-reject.sh` — 5 config-lint preconditions local, 401/403-or-login-redirect live
- `infra/oracle/drills/wipe-restore.sh` — 3 count PASS lines + empty-guard self-test local, guarded destructive live
- `infra/oracle/drills/secrets-scan.sh` — history + staged via gitleaks or assembled-pattern fallback

## Decisions Made

- v0.40.5 per operator Option B (see Task 1 above); fallback to locked `0.35.0` with printed evidence lives in `rebuild.sh`.
- Drills run local/config-lint with cloud credentials absent per the human verdict — live assertions stay deferred, never blocked on.
- Backup off-server target is env-plumbed option (`PB_BACKUP_REMOTE` via aws/rclone); local snapshots are the PASS guarantee.
- Branch `agent-01-04-foundation` was already at main HEAD (`ed7fc96`) at resume — the workspace-rule merge was a verified no-op; STATE/ROADMAP/REQUIREMENTS untouched per workspace rule (orchestrator owns central sync).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added tsc build wiring not in the plan's file list**
- **Found during:** Task 2 (new `apps/bot` package must resolve `@zod/*` under `pnpm build`)
- **Issue:** No `apps/bot/tsconfig.json` and no root solution reference existed for the new package, so `tsc -b` ignored it and the skeleton stayed unproven
- **Fix:** Added `apps/bot/tsconfig.json` (config+logger refs, same convention as 01-01), root `tsconfig.json` reference, `pnpm install` lockfile update (same precedent as 01-01/01-02 deviations)
- **Files modified:** `apps/bot/tsconfig.json`, `tsconfig.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm build` clean; bot boots exit 0 with secrets, exit 1 without; committed in `6183ca4`

**2. [Rule 3 - Blocking] Created apps/dashboard/package.json inside Task 2**
- **Found during:** Task 2 (file sits in `files_modified` + plan artifacts but in no task `<files>` list)
- **Issue:** Workspace importer missing for the shell app; plan-scope file would otherwise never land
- **Fix:** Minimal private package, zero deps, documents the Pages-deploy/no-build contract
- **Verification:** `pnpm install` records the importer; committed in `6183ca4`

**3. [Rule 3 - Blocking] Pointed the scheduler unit at the built checkout**
- **Found during:** Task 3 (unit as written pointed `ExecStart` at an `/opt/zod/scheduler` prefix)
- **Issue:** The compiled emit resolves `@zod/*` through workspace `node_modules` in place — a copied prefix would boot to module-not-found on the VM
- **Fix:** `ExecStart` → `/home/zod/zod/apps/scheduler/dist/index.js` with `WorkingDirectory=/home/zod/zod`; rebuild clones/builds the repo there
- **Files modified:** `infra/cloudflared/scheduler.service`
- **Verification:** Task 2 verify re-run green after the edit; committed in `b0e408a`

**4. [Rule 1 - Bug] Fixed leading-dash grep misparse in secrets-scan fallback**
- **Found during:** Task 3 verify (stderr showed `grep: unrecognized option '-----BEGIN …'`)
- **Issue:** The private-key pattern starts with `-`, so `grep -E "$pat"` parsed it as a flag and that pattern scanned nothing (vacuous PASS)
- **Fix:** `grep -E -- "$pat"` (and `--` on the companion greps)
- **Verification:** Clean `SECRETS-SCAN PASS` on the real repo (30 commits + staged) plus a synthetic-corpus positive control detecting both dash-leading patterns; committed in `b0e408a`

---

**Total deviations:** 4 auto-fixed (3 blocking-wiring, 1 bug).
**Impact on plan:** All required for the plan's own success criteria (buildable workspace, bootable units, honest secret scan). No scope creep, no new runtime dependency, no architectural change.

## Issues Encountered

- `gsd_run` CLI is absent in this execution environment — STATE.md / ROADMAP.md / REQUIREMENTS.md mutations skipped per the workspace rule (orchestrator owns central sync; same posture as 01-01/01-02/01-03).
- Cloud credentials (`OCI_VM_HOST`, `CLOUDFLARE_TUNNEL_TOKEN`, `DASHBOARD_HOSTNAME`, `ACCESS_OWNER_EMAIL`, Turso pair) absent — exactly the case the human verdict covers: drills prove in local/config-lint mode, live assertions deferred to the real host (tracked as coverage D6, human-judgment).
- `gitleaks` not installed here — secrets-scan fallback carried the proof; positive control confirms the assembled patterns detect.

## Known Stubs

None — every file is wired: shell renders, bot boots, units declare, rebuild dry-runs, all four drills PASS. Provisioning placeholders (`TUNNEL-UUID-PLACEHOLDER`, `dash.example.com` in `config.yml`) are Day-0 owner inputs filled per `runbook.md` §0/§3 (plan `user_setup`, not gaps); live telemetry UI stays Phase 7 per D-22.

## User Setup Required

None by this plan's automation — but the Day-0 owner prerequisites in `runbook.md` §0 (Oracle VM + block volume, Turso DB + token, Cloudflare tunnel + hostname + owner email, PB service account, dead-man URLs) must be satisfied before the live rebuild on the real host. No `USER-SETUP.md` generated (prerequisites already specified in-plan via `user_setup` + runbook).

## Next Phase Readiness

- Ready for Phase 1 verification: criteria 1–4 are each provable by script (`rebuild.sh --dry-run`, `wipe-restore.sh --local`, `port-scan.sh --local`, `edge-reject.sh --local`, `secrets-scan.sh`); live runs await the Day-0 host.
- Ready for Phase 7: tunnel hostname + Access policy + unit names (`cloudflared`, `zod-scheduler`, `zod-pocketbase`) are the stable surface the dashboard phase builds on.
- Watch items: re-verify `v0.40.5` asset + checksums at provision time (fallback is automatic with evidence); confirm `dash.example.com` replaced by `DASHBOARD_HOSTNAME` during provisioning.
- Branch `agent-01-04-foundation` holds 2 task commits over `ed7fc96`; orchestrator to merge and run central STATE/ROADMAP/requirements sync (MEM-01, MEM-03, OPS-01 shared until merge).

## Self-Check: PASSED

All 15 created key files found on disk; commits `6183ca4` + `b0e408a` verified in history; measured `commits: 2` from base `ed7fc96`; Task 2 + Task 3 plan verifies re-run green; build clean; 50/50 vitest green.

---
*Phase: 01-foundation*
*Completed: 2026-10-15*
