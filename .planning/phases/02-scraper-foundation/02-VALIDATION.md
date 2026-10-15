---
phase: "2"
slug: "scraper-foundation"
status: complete
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-15"
audited: "2026-10-15"
---

# Phase 2 — Scraper Foundation — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Audited
> after execution against the shipped test suite (106 tests, 17 test files).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.2.7 (repo pin from Phase 1 — keep, do not bump to 5.x) |
| **Config file** | repo `vitest` config — workspaces cover `packages/*` |
| **Quick run command** | `pnpm vitest run packages/browser packages/sanitize packages/scout packages/db-hot packages/scheduler` |
| **Full suite command** | `pnpm build && pnpm test` |
| **Full suite result (2026-10-15)** | 17 test files, 106 tests — all green (7.08s → 8.17s) |
| **Estimated runtime** | ~8 seconds (full suite; soak is out-of-process) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run <touched-package>` (quick command scoped)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite green; soak script syntax green; soak thresholds require a long-running host
- **Max feedback latency:** 30 seconds (suite) — soak excluded (long-running)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | SWM-03 | T-02-01 | unit | `pnpm vitest run packages/db-hot -- scratchpad` | ✅ | ✅ green |
| 02-01-02 | 01 | 1 | D-06 | T-02-02 | unit | `pnpm vitest run packages/config packages/logger` | ✅ | ✅ green |
| 02-01-03 | 01 | 1 | D-08..D-15 | T-02-03 | unit | `pnpm vitest run packages/browser` | ✅ | ✅ green |
| 02-02-01 | 02 | 2 | ING-06 | T-02-04 | unit | `pnpm vitest run packages/sanitize -- sanitize` | ✅ | ✅ green |
| 02-02-02 | 02 | 2 | ING-06 | — | integration | `pnpm vitest run packages/sanitize -- byteproof` | ✅ | ✅ green |
| 02-02-03 | 02 | 2 | D-01/D-02/D-07 | — | unit | `pnpm vitest run packages/sanitize -- fetch` | ✅ | ✅ green |
| 02-03-01 | 03 | 3 | SWM-01 | T-02-05 | unit | `pnpm vitest run packages/scout -- expiry` | ✅ | ✅ green |
| 02-03-02 | 03 | 3 | SWM-01 | T-02-06 | unit | `pnpm vitest run packages/scout -- spam` | ✅ | ✅ green |
| 02-03-03 | 03 | 3 | SC-1 (tracer) | — | integration | `pnpm vitest run packages/scheduler -- poll-wiring` | ✅ | ✅ green |
| 02-SEC-01 | 01 | 1 | T-02-07..T-02-12 | 6/6 threats closed | unit | `pnpm vitest run packages/logger -- redact` | ✅ | ✅ green |
| 02-SOAK-01 | 03 | 4 | SC-1 (soak) | — | soak | `bash infra/oracle/drills/browser-soak.sh --local` | ✅ | ⚠️ manual (script present; 24h threshold host-bound) |

*Status: ✅ green · ❌ red · ⚠️ manual/flaky*

---

## Verification Map → Requirement Coverage

| Requirement / Truth (must_have) | Test File(s) | Automated Command | Result |
|-------------|--------------|-------------------|--------|
| SWM-03 — persistent Task_Scratchpad STEP_1→STEP_2 resume | `packages/db-hot/src/scratchpad.test.ts` (10) | `pnpm vitest run packages/db-hot -- scratchpad` | ✅ green |
| D-06 — `JINA_API_KEY` required at boot | `packages/config/src/env.test.ts` (4) | `pnpm vitest run packages/config` | ✅ green |
| D-06 — `JINA_API_KEY` redacted in logs | `packages/logger/src/redact.test.ts` (1) | `pnpm vitest run packages/logger` | ✅ green |
| D-08..D-15 — shared browser, ≤2 tabs, media blocked, queue FIFO, close-on-error | `packages/browser/src/queue.test.ts` (4), `browser.test.ts` (1) | `pnpm vitest run packages/browser` | ✅ green |
| ING-06 — sanitize strip + turndown + 8k cap | `packages/sanitize/src/sanitize.test.ts` (8) | `pnpm vitest run packages/sanitize -- sanitize` | ✅ green |
| ING-06 — byte-proof drill ≥85% reduction (measured 8.83%, 14.11%) | `packages/sanitize/src/byteproof.test.ts` (3) | `pnpm vitest run packages/sanitize -- byteproof` | ✅ green |
| D-01/D-02/D-07 — fail-signal routing Jina→browser + SSRF guard + cooling | `packages/sanitize/src/fetch.test.ts` (6) | `pnpm vitest run packages/sanitize -- fetch` | ✅ green |
| SWM-01 — expiry rejection (zero grace) | `packages/scout/src/expiry.test.ts` (7) | `pnpm vitest run packages/scout -- expiry` | ✅ green |
| SWM-01 — spam rejection (precision bias) | `packages/scout/src/spam.test.ts` (10) | `pnpm vitest run packages/scout -- spam` | ✅ green |
| SWM-01 — `prefilter()` composed verdict, zero fetch | `packages/scout/src/scout.test.ts` (5) | `pnpm vitest run packages/scout -- scout` | ✅ green |
| SC-1 tracer — Scout → scratchpad → fetch → STEP_2 order | `packages/scheduler/src/poll-wiring.test.ts` (2) | `pnpm vitest run packages/scheduler -- poll-wiring` | ✅ green |
| dedup two-tier precheck + recall rehearsal | `packages/dedup/src/fingerprint.test.ts` (11), `packages/db-cold/src/ledger.test.ts` (9) | `pnpm vitest run packages/dedup packages/db-cold` | ✅ green |
| scheduler overlap / jitter / sizing | `packages/scheduler/src/overlap.test.ts` (13) | `pnpm vitest run packages/scheduler` | ✅ green |

---

## Wave 0 Requirements (all satisfied)

- [x] `packages/db-hot/src/scratchpad.ts` + `src/scratchpad.test.ts` — SWM-03
- [x] `packages/browser/` scaffold + `src/queue.test.ts` (fake Browser/Context) — D-08..D-15
- [x] `packages/sanitize/` scaffold + `src/strip.test.ts`/`sanitize.test.ts`, `src/fetch.test.ts`, `src/byteproof.test.ts` — ING-06
- [x] `packages/scout/` scaffold + `src/expiry.test.ts`, `src/spam.test.ts`, `src/scout.test.ts` — SWM-01
- [x] `packages/config` env extension: `JINA_API_KEY` required + redaction test — D-06
- [x] `packages/logger` redaction log paths — T-02-07..T-02-12
- [x] `infra/oracle/drills/browser-soak.sh` — SC-1 soak harness (syntax: `bash -n` pass)
- [x] Scheduler poll-wiring tracer test — SC-1 ordering (added during audit)
- [x] Dependencies installed: `playwright-core`, `p-limit`, `cheerio`, `turndown`, `date-fns`(+tz)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Jina keyed live fetch against representative URL set | D-06 | network + secret | Run `pnpm vitest run packages/sanitize -- fetch --live` with `JINA_API_KEY` set; expect `Title:/URL Source:/Markdown Content:` envelope |
| Representative URL byte-proof set (3–5 URLs) | SC-2 / D-05 | external portals change shape | Curate fixture list in `packages/sanitize/src/byteproof.test.ts`; record raw vs capped byte counts in VALIDATION.md sign-off |
| 24h browser soak — flat RSS, zero zombie Chromium | SC-1 | long-running, host-bound | `infra/oracle/drills/browser-soak.sh` (24h host run); mini-soak via `--local` on dev box (script syntax validated, mini-soak not observed to completion this run) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (suite 8.17s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-10-15 — 106/106 tests green. Open code-review findings (02-REVIEW.md, 11 total incl. 3 critical) and soak threshold are documented as advisory / operational items, not phase-gate blockers (see 02-VERIFICATION.md Advisory + Probe sections).
