---
phase: "05"
slug: "jobs-loot-pipelines"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-16"
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by plan-phase from `05-RESEARCH.md` § Validation Architecture. Per-task rows populate from PLAN task IDs after planning.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `^3.2.7` ([VERIFIED: package.json:19] — keep, do not bump) |
| **Config file** | root `vitest.config.ts` (workspace key — do NOT rename to `projects`) fanning out to `packages/*/vitest.config.ts` |
| **Quick run command** | `pnpm vitest run <package-or-path>` (e.g. `pnpm vitest run packages/dedup`) |
| **Full suite command** | `pnpm test` (`"test": "vitest run"` — 34 test files at Phase 4 close) |
| **Estimated runtime** | ~60 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run <touched-package>` (<30s per package)
- **After every plan wave:** Run `pnpm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green (Phase 4 closed at 210/210 passing — keep that bar)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|

*Populated from PLAN task IDs after planning. Requirement-level projection from RESEARCH.md is below.*

---

## Phase Requirements → Test Map (from RESEARCH.md)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-03 | Each source adapter parses a recorded fixture → `PollCandidate[]`; Workday/HN recipes covered | unit | `pnpm vitest run packages/discord-router/src/portals/jobs` | ❌ Wave 0 |
| ING-03 | New cron entries registered in single registry with timezone/noOverlap/jitter | unit | `pnpm vitest run packages/scheduler` | ✅ (extend existing registry tests) |
| EVT-07 | Merge iff ≥0.9 + ±3d + org/company; below → flag only; links unioned; late dupe appends without re-post | unit + integration | `pnpm vitest run packages/dedup` | ❌ Wave 0 |
| JOB-01 | Geo gate admits India/hybrid/India-remote/global-remote; rejects US/EMEA-only + work-auth language | unit | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| JOB-02 | Auditor rule-pack prompt contains admission classes; verdict schema admits 0–1yr/fellowship | unit (contract) | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| JOB-03 | Reason codes (`unpaid_non_fellowship`, scam classes) tombstone + never alert | unit + integration | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| JOB-04/05 | Stack classifier picks sys/cloud bucket vs general SWE; both set `bucket_channel` | unit | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| LOT-01 | Prize-gate fail + real perk → divert verdict, not reject | unit | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| LOT-02/03/04 | Verdict carries `card_required`, `claim_steps` w/ quote, `shipping_verified`; US/EU-only rejects | unit | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| Orchestrator e2e | STEP_2 row + fake router → `opportunities` row `status='audited'` + `bucket_channel`; reject path → tombstone | integration | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| Channel routing | New `bucket_channel` values resolve (ID-first) via router-service | unit | `pnpm vitest run packages/discord-router` | ✅ (extend) |

---

## Wave 0 Requirements

- [ ] `packages/discord-router/src/portals/jobs/*.test.ts` — fixture-driven adapter tests (Greenhouse/Lever/Ashby/HN first; Cutshort/Cuvette/Workday after spike)
- [ ] `packages/dedup/src/merger.test.ts` — threshold/window/flag cases + link-union + late-dupe append
- [ ] `packages/orchestrator/src/*.test.ts` — rule-pack contract tests + gate unit tests + STEP_2→write integration with fake router/pb/cold
- [ ] Recorded JSON fixtures for each ATS (trimmed, checked into test dirs)
- [ ] Extend `packages/scheduler` registry tests for the new cron entries
- [ ] Install `string-similarity-js` into `@zod/dedup` (or choice of audited alternate)

*Framework install: not needed (vitest present).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|

*None identified at seed time — all phase behaviors target automated verification; Wave 0 fills the test gaps.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
