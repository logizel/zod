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
| 05-01-T1 | 05-01 | 1 | ING-03, JOB-01..05 | T-05-01..07 | Untrusted text framed as data; SSRF-guarded fetch; idempotent drain (url_hash pre-check); bounded getList; pipeline from code-owned table | integration | `pnpm vitest run packages/orchestrator` | ❌ new | pending |
| 05-01-T2 | 05-01 | 1 | ING-03, JOB-04, JOB-05 | T-05-03, T-05-05 | Channel IDs env-first; no secrets/channel IDs logged; tombstone reasons verbatim; no network in tests | unit | `pnpm vitest run packages/discord-router packages/scheduler packages/config` | ✅ extend | pending |
| 05-02-T1 | 05-02 | 2 | ING-03 | T-05-08, T-05-11, T-05-12 | Never-throw parse (non-ok/empty/malformed → []); atomic tmp+rename state writes; no credential surface (public endpoints) | unit | `pnpm vitest run packages/discord-router` | ❌ new | pending |
| 05-02-T2 | 05-02 | 2 | ING-03 | T-05-09, T-05-10, T-05-13 | Fixed-host fetches (code-owned consts); bounded browser pagination; learn-once rotation; URL dedupe | unit | `pnpm vitest run packages/discord-router` | ❌ new | pending |
| 05-03-T1 | 05-03 | 2 | JOB-03 | T-05-15, T-05-16 | Senior reject traceable (senior_role + decided_at); flag-only detectors never auto-reject; zero-fetch screen; events untouched | unit + integration | `pnpm vitest run packages/scout packages/scheduler` | ❌ new | pending |
| 05-03-T2 | 05-03 | 2 | JOB-01..05 | T-05-14, T-05-17, T-05-18 | Prompt-injection framing; parse failure never admits; enumerated reason codes verbatim; fellowship allowlist fail-closed | unit (contract) | `pnpm vitest run packages/orchestrator` | ❌ new | pending |
| 05-04-T1 | 05-04 | 2 | LOT-02, LOT-03, LOT-04 | T-05-19, T-05-20, T-05-23 | Quoted evidence required to admit; 2-hop SSRF-guarded FAQ read; loot tombstones verbatim; no unfetched-content audit | unit + integration | `pnpm vitest run packages/orchestrator` | ❌ new | pending |
| 05-04-T2 | 05-04 | 2 | LOT-01 | T-05-21, T-05-22, T-05-23 | Divert requires perk_hint + full loot gate pass; single terminal outcome; bounded audit volume; verbatim reasons | integration | `pnpm vitest run packages/orchestrator` | ❌ new | pending |
| 05-04-T3 | 05-04 | 2 | LOT-02, LOT-04 | T-05-24 | Config-owned fetch targets (fixed mode enum); loot card fields render quotes; watchlist failure isolated | unit | `pnpm vitest run packages/discord-router` | ❌ new | pending |
| 05-05-T1 | 05-05 | 3 | EVT-07 | T-05-25, T-05-26, T-05-27, T-05-29 | Threshold + evidence + window all mandatory; bounded candidate queries; audited pinned dependency | unit | `pnpm vitest run packages/dedup` | ❌ new | pending |
| 05-05-T2 | 05-05 | 3 | EVT-07 | T-05-28 | Race single-master; merged tombstone ('merged'/'merger'); append-only late dupes; fresh-only intake | integration | `pnpm vitest run packages/scheduler packages/orchestrator packages/discord-router` | ❌ new | pending |
| 05-06-T1 | 05-06 | 4 | all 11 | T-05-30 | Mixed-batch exact ledger; per-row isolation; no cross-pipeline writes | integration | `pnpm vitest run packages/orchestrator` | ❌ new | pending |
| 05-06-T2 | 05-06 | 4 | all 11 | T-05-31 | Env bijection guard (canary keys); fail-fast boot preserved; full-suite phase gate | unit + gate | `pnpm test` | ❌ new | pending |

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
