---
phase: "1"
slug: "foundation"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-15"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.2.7 (v3 line per D-05) |
| **Config file** | none — Wave 0 installs root `vitest.config.ts` (`test.workspace`) + per-package configs |
| **Quick run command** | `pnpm vitest run --project unit` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~30 seconds (unit); drills run separately as scripts |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --project unit`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd-verify-work`:** Full suite green + all four drill scripts green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | MEM-01 | T-1-01 | PB loopback-only, no public listener | integration | `pnpm --filter @zod/db-hot test` | ✅ | ✅ green (client.test.ts 5-collection lock + port-scan drill PASS) |
| 1-02-01 | 02 | 1 | MEM-02 | — | Telemetry 24h trim predicate correct | unit | `pnpm vitest run packages/db-hot` | ✅ | ✅ green (old/boundary/fresh fixtures) |
| 1-02-02 | 02 | 1 | MEM-03 | — | Fingerprint stable; hot-then-cold point lookup | unit + integration | `pnpm vitest run packages/dedup` | ✅ | ✅ green (11 fingerprint + precheck tests; mocked transports, live deferred) |
| 1-03-01 | 03 | 2 | OPS-01 | — | No overlapping ticks; durations recorded | unit (drill harness) | `pnpm vitest run packages/scheduler` | ✅ | ✅ green (forced-overlap skips + metrics sink) |
| 1-04-01 | 04 | 2 | D-06 | T-1-02 | Env gate throws; logger redacts secrets | unit | `pnpm vitest run packages/config packages/logger` | ✅ | ✅ green (4 env + redact tests) |
| 1-04-02 | 04 | 2 | D-18/D-20 | T-1-03 | Zero public listeners; unauth UI+SSE rejected | script drill | `bash infra/oracle/drills/port-scan.sh`, `edge-reject.sh` | ✅ | ✅ green (local modes PASS; live UAT-passed 5/5) |
| 1-04-03 | 04 | 2 | D-16/D-26 | — | Wipe-restore + one-command rebuild | script drill | `bash infra/oracle/drills/wipe-restore.sh`, `rebuild.sh` | ✅ | ✅ green (named PASS lines; live UAT-passed 5/5) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` (root, `test.workspace`) + per-package `vitest.config.ts` files
- [ ] `packages/dedup/src/fingerprint.test.ts` — must-match/must-differ fixtures + URL normalization cases
- [ ] `packages/config/src/env.test.ts` — missing-secret throws; defaults apply
- [ ] `packages/logger/src/redact.test.ts` — secret paths censored, non-secrets pass through
- [ ] `packages/scheduler/src/overlap.test.ts` — forced-overlap skip + `execution:overlap` counter
- [ ] `infra/oracle/drills/*.sh` — port-scan, edge-reject, wipe-restore harnesses
- [ ] Ephemeral PB (local binary) + Turso test DB for integration tests — planner decides (local PB binary vs `pocketbase` npm test helper)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Oracle VM provisioned per runbook on real Ampere host | OPS-01 / crit. 1 | Requires real cloud account + billing-side host | Run `rebuild.sh` against fresh Ampere instance; assert PB + Turso schemas restore |
| Zero Trust Access owner-only wall live | DSH-edge / crit. 3 | Requires real Cloudflare account policy | Unauthenticated curl to UI + SSE endpoints; assert reject before render |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-15

## Validation Audit 2026-10-15
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Requirement coverage: OPS-01 (env/boot/scheduler/drills), MEM-01 (schemas/client), MEM-02 (trim predicate), MEM-03 (fingerprint/precheck) — all COVERED, 50/50 green. Depth caveats (mocked Turso transports, toy-table drill fixtures) recorded in 01-REVIEW.md L-01/L-02; live-host proofs UAT-passed 5/5. No new test files required.
