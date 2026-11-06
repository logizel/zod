---
phase: "7"
slug: "telemetry-dashboard-ops-hardening"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-17"
validated: "2026-11-06"
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3 |
| **Config file** | root `vitest.config.ts` workspace + `apps/dashboard-server/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @zod/dashboard-server test` |
| **Full suite command** | `pnpm test` |
| **Drill command** | `infra/oracle/drills/<name>.sh --local` |
| **Estimated runtime** | ~20 seconds (unit); drills < 1s each |

---

## Sampling Rate

- **After every task commit:** Run the relevant package tests or drill.
- **After every plan wave:** Run the dashboard-server suite + full root suite.
- **Before phase verification:** `pnpm build`, `pnpm test`, dashboard tests, and all local drills must be green.
- **Max feedback latency:** 60 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | DSH-02, DSH-03 | T-07-02 | SSE viewer cap + shared subscription | unit | `pnpm --filter @zod/dashboard-server test` | ✅ | ✅ green |
| 07-01-02 | 01 | 1 | DSH-01 | T-07-01 | Zero Trust rejects before render/connect | drill | `infra/oracle/drills/edge-reject.sh --local` | ✅ | ✅ green |
| 07-01-03 | 01 | 1 | MEM-05 | T-07-04 | GC job registered with `noOverlap` | unit | `pnpm exec vitest run packages/scheduler/src/registry.test.ts` | ✅ | ✅ green |
| 07-02-01 | 02 | 2 | DSH-04 | T-07-05 | Filter params parsed with zod | unit | `pnpm exec vitest run apps/dashboard-server/src/boards.test.ts` | ✅ | ✅ green |
| 07-02-02 | 02 | 2 | DSH-02, DSH-03 | T-07-02, T-07-09 | Bucket states + baton-pass deltas | unit + UAT | `pnpm exec vitest run apps/dashboard-server/src/sse.test.ts` | ✅ | ✅ green |
| 07-03-01 | 03 | 3 | DSH-01, DSH-04 | T-07-09, T-07-10 | Tunnel-death / GC / recovery proof | drill | `edge-reject.sh`, `gc-verify.sh`, `kill-cloudflared.sh`, `tunnel-restart-recovery.sh` | ✅ | ✅ green |
| 07-03-02 | 03 | 3 | DSH-01, DSH-04, MEM-05 | T-07-03, T-07-04, T-07-08 | GC telemetry + 25h alert + ops-health + secrets hygiene | unit + drill | `gc.test.ts`, `alerts.test.ts`, `env-drift.test.ts`, `secrets-scan.sh` | ✅ | ✅ green |
| 07-FIX-CR-01 | 05 | 1 | DSH-02, DSH-04 | T-07-01 | Tunnel-origin URLs on dashboard script tag | code + UAT | `apps/dashboard/index.html` data attributes; UAT #3 | ✅ | ✅ green |
| 07-FIX-WR-01 | 04 | 1 | DSH-01, DSH-04 | T-07-01 | `authorizeStream` before `hub.addClient` | unit + UAT | `apps/dashboard-server/src/index.ts:25-29,64`; UAT #1 | ✅ | ✅ green |
| 07-FIX-WR-04 | 06 | 2 | DSH-01, DSH-02 | T-07-02 | Server-side viewer cap replaces client reconnect cap | unit + UAT | `index.ts:42-54`, `sse.ts:58-69`; UAT #10 | ✅ | ✅ green |
| 07-FIX-WR-05 | 07 | 3 | DSH-04 | T-07-05 | User-visible boards error banner | code + UAT | `apps/dashboard/index.html:385`; UAT #3 | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Validation evidence (2026-11-06):** dashboard-server suite → **4 files / 42 tests passed**; root suite → **73 files / 722 tests passed**; all 12 `pnpm verify:local` gates passed; UAT 10/10.

---

## Wave 0 Requirements

- [x] `apps/dashboard-server/src/sse.test.ts` — SSE fan-out, viewer cap, bucket states
- [x] `apps/dashboard-server/src/boards.test.ts` — board scopes + combined filters
- [x] `apps/dashboard-server/src/gc.test.ts` — GC purge, telemetry, 25h alert
- [x] `apps/dashboard-server/src/alerts.test.ts` — ops-health channel resolution
- [x] `packages/db-hot/src/telemetry.test.ts` — telemetry purge coverage (substitutes for the plan's inaccurate `apps/dashboard-server/src/telemetry.test.ts` path; IN-05)
- [x] `packages/scheduler/src/registry.test.ts` — GC job registration + `noOverlap` + jitter
- [x] `infra/oracle/drills/edge-reject.sh` — Zero Trust edge rejection
- [x] `infra/oracle/drills/gc-verify.sh` — GC purge + tombstone/taste survival
- [x] `infra/oracle/drills/kill-cloudflared.sh` — tunnel death is dashboard-only
- [x] `infra/oracle/drills/tunnel-restart-recovery.sh` — reconnect + queued alert drain
- [x] `packages/config/src/env-drift.test.ts` — `.env.example` bijection for 4 new keys

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Result |
|----------|-------------|------------|-------------------|--------|
| Live agent slot rows + 429 baton-pass ticker | DSH-02 | Requires live SSE + LLM bucket transitions | Open dashboard; force 429; observe ticker | ✅ pass (UAT #1, #6) |
| Health grid state colors/labels | DSH-03 | Visual state rendering | Trigger bucket state change; observe cell | ✅ pass (UAT #2, #5) |
| Tabbed boards + combined filters | DSH-04 | Browser interaction | Switch tabs; combine filters | ✅ pass (UAT #3, #4) |
| `#🛠-ops-health` alert delivery | DSH-01, MEM-05 | Requires Discord + real channel | Trigger GC/tunnel failure; observe channel | ✅ pass (UAT #7) |
| Zero Trust + firewall posture | DSH-01 | Requires deployed edge/VM | Open unauth dashboard; probe ports | ✅ pass (UAT #1, #8) |
| GC 25h alert + recovery | MEM-05 | Requires >25h wall-clock simulation | Skip GC night; observe alert; recover | ✅ pass (UAT #9) |
| Tunnel restart + SSE reconnect | DSH-01, DSH-04 | Requires live tunnel process | Kill/restart cloudflared; observe reconnect | ✅ pass (UAT #10) |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-06 — evidence: `pnpm build` green; root suite 722/722; dashboard-server 42/42; 12/12 `verify:local` gates; `07-UAT.md` 10/10; `07-SECURITY.md` 0 open threats.
