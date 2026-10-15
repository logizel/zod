# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 1-Foundation
**Areas discussed:** Monorepo scaffold shape, Hot/cold memory depth, Tunnel + dashboard shell, Scheduler + reclaim defense

---

## Monorepo scaffold shape

| Option | Description | Selected |
|--------|-------------|----------|
| Full layout now | Full apps/bot,scheduler,dashboard + packages/* now per research contract | ✓ |
| Minimal, grow later | Minimal apps/scheduler + core packages only | |
| You decide | Agent picks layout | |

**User's choice:** Full layout now; pnpm strict; tsc build; Core-only packages; vitest from day 1; Strict env gate; Strict + zod v4; pino structured
**Notes:** Two passes — first 4 (layout, toolchain, prod entry, package set), then 4 more (vitest, env gate, zod, logging). No free-text overrides.

## Hot/cold memory depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full schemas now | opportunities + telemetry + scratchpad + tombstone + taste with indexes | ✓ |
| Minimal MEM-only | Only MEM-01/02/03, defer scratchpad/taste | |
| You decide | Agent picks depth | |

**User's choice:** Full schemas now; Localhost + volume; Remote-only cold; Hash + two-tier check; Realtime-ready now; Pin per STACK; GC-ready fields; Wipe-drill proof
**Notes:** User opted for maximum Phase 1 readiness (GC fields, realtime auth, fingerprint) to avoid migrations.

## Tunnel + dashboard shell

| Option | Description | Selected |
|--------|-------------|----------|
| Shell + Pages now | Static placeholder behind Zero Trust + supervised cloudflared + Pages | ✓ |
| Tunnel only | Tunnel + Zero Trust, no shell until Phase 7 | |
| You decide | Agent picks shell scope | |

**User's choice:** Shell + Pages now; Zero open ports; Supervised + 2 beats; Edge-reject test; Apt + auto-update; Static shell only
**Notes:** Static shell only — live SSE explicitly deferred to Phase 7. Automated edge-reject + port-scan proofs required.

## Scheduler + reclaim defense

| Option | Description | Selected |
|--------|-------------|----------|
| Framework + stubs | Framework + one stub job per cadence with metrics | ✓ |
| Bare framework | Bare framework, no stubs | |
| You decide | Agent picks scope | |

**User's choice:** Framework + stubs; kelektiv + guards; Cache + watchdog; One-command rebuild; Overlap test; Scan + redact
**Notes:** Last area, no remaining areas. Automated proofs: forced-overlap skip, git-history secret scan, wipe-restore drill.

---

## Agent's Discretion

None — user selected concrete options for all questions. Planner/researcher retain flexibility on: watchdog provider, backup object-storage target, stub-job naming, heartbeat intervals, exact index sets.

## Deferred Ideas

None — discussion stayed within phase scope. Todo match count 0, no scope creep raised.
