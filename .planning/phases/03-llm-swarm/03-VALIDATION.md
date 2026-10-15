---
phase: "03-llm-swarm"
slug: llm-swarm
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-16"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> State B reconstruction (State B: no prior VALIDATION.md, SUMMARY.md artifacts present). Reconstructed from 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-VERIFICATION.md, and all three PLAN.md files.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.2.7 |
| **Config file** | vitest.config.ts (root), packages/llm/vitest.config.ts, packages/scheduler/vitest.config.ts (+ per-package configs for config/logger/sanitize/db-*) |
| **Quick run command** | `pnpm vitest run packages/llm` (59 tests) / `pnpm vitest run packages/scheduler` (21 tests) |
| **Full suite command** | `pnpm test` (root workspace) |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run packages/llm` (and `pnpm vitest run packages/scheduler` when scheduler files touched)
- **After every plan wave:** Run full workspace suite `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | SWM-04, SWM-05, SWM-06 | T-03-01/02/03/04/05 | Checkpoint:decision — confirm D-01 (agent_telemetry persistence) and D-02 (vendor SDK error-type detection) as locked decisions before implementation | checkpoint | `echo "Checkpoint: user confirms D-01, D-02"` | N/A | ✅ green (confirmed pre-implementation) |
| 03-01-02 | 01 | 1 | SWM-04, SWM-05, SWM-06 | T-03-01/02/03/04/05 | End-to-end tracer: Groq → forced 429 → 60s cooldown → GitHub Models fallback → one complete JSON verdict, zero re-scrape; finish_reason:length stitched via one continuation; Cerebras absent from ladder; per-bucket state written to agent_telemetry | unit + chaos | `pnpm vitest run packages/llm` | ✅ | ✅ green (22 tests: router 7, bucket 9, chaos 6) |
| 03-02-01 | 02 | 2 | SWM-04, SWM-05, SWM-06 | T-03-06/07/08/09/13 | Full 2D ladder: Tier1×6 models (Groq×3, GitHub Models×2, SambaNova×1 opt-in), Tier2 overflow engages only after ALL Tier1 exhaust, priority lanes Curator>Auditor>Scout, daily-cap bulkheads, zero-cost circuit-breaker | unit | `pnpm vitest run packages/llm` | ✅ | ✅ green |
| 03-02-02 | 02 | 2 | SWM-04, SWM-05, SWM-06 | T-03-06/07/08/09/13 | Chaos suite: per-model 429/413/finish_reason:length across all Tier1+Tier2 models → baton-pass or stitch, zero re-scrape, no crash; total exhaustion → UNVERIFIED + reason, no Cerebras routing | chaos | `pnpm vitest run packages/llm` | ✅ | ✅ green |
| 03-03-01 | 03 | 3 | SWM-04 | T-03-10/14 | Scheduler registry integration: gateway bucket cool-down + daily-cap reset timers via single cron registry (noOverlap + maxRandomDelay jitter), no scattered setInterval in packages/llm | unit | `pnpm vitest run packages/scheduler` | ✅ | ✅ green |
| 03-03-02 | 03 | 3 | SWM-06 | T-03-11/12/14 | Gateway entrypoint fail-fast boot (parseEnv → createLogger → LlmRouter, Cerebras absent); operator telemetry visibility via readBucketState/bucketStatusHistory | unit | `pnpm vitest run packages/llm packages/scheduler` | ✅ | ✅ green |
| 03-03-03 | 03 | 3 | SWM-04, SWM-05, SWM-06 | T-03-01..14 | Success criteria 1–4 operator demonstration: forced 429→next bucket verdict zero re-scrape; length-cut→complete JSON verdict; Cerebras absent with Tier2 after Tier1 exhaustion; per-bucket state visible in agent_telemetry | manual_procedural | Operator confirmation (checkpoint:human-verify, gate blocking-human) | N/A | ✅ green (operator-approved all 4 criteria) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. vitest framework and per-package configs were already present from prior phases; no new test framework installation or stub scaffolding required. All phase test files created inline with implementation (router.test.ts, bucket.test.ts, chaos.test.ts, telemetry.test.ts, registry.test.ts extensions).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Success criteria 1–4 end-to-end demonstration (operator approval) | SWM-04, SWM-05, SWM-06 | Success criteria are operator-judgment end-to-end demonstrations; no automated test can confirm the operator's own confirmation of each criterion against live behavior. All underlying automated tests pass; only the operator's sign-off is manual. | 1. Criterion #1: Run chaos.test.ts forced-429 case; confirm bucket marked 60s-COOLDOWN, fallback returns verdict, same step1/step2 re-issued (no source re-fetch). 2. Criterion #2: Run router.test.ts finish_reason:length case; confirm one continuation produces complete JSON verdict (JSON.parse on merged output). 3. Criterion #3: Confirm Cerebras absent from ladder (ladder.test.ts 'no Cerebras' assertion); confirm Tier2 only engages when all Tier1 COOLDOWN/DAILY-CAP. 4. Criterion #4: Confirm telemetry.test.ts shows READY → 60s-COOLDOWN → READY transitions written to agent_telemetry. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or checkpoint verification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — existing infrastructure sufficient)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-16

---

**Gap Analysis:** No gaps found. All three requirements (SWM-04, SWM-05, SWM-06) are COVERED by automated tests across plans 03-01, 03-02, and 03-03. VERIFICATION.md reports 14/14 must-haves verified, all 4 ROADMAP success criteria verified, 80 tests green (59 llm + 21 scheduler), both packages compile with `tsc -b`, no anti-patterns found. The only non-automated item is the operator-approved success criteria demonstration (03-03-03), classified manual_procedural with human_judgment: true.
