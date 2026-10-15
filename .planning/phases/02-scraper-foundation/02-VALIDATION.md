---
phase: "2"
slug: "scraper-foundation"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-15"
---

# Phase 2 — Scraper Foundation — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3.2.7 (repo pin from Phase 1 — keep, do not bump to 5.x) |
| **Config file** | repo `vitest` config — extend `include` for new packages |
| **Quick run command** | `pnpm vitest run packages/browser packages/sanitize packages/scout packages/db-hot` |
| **Full suite command** | `pnpm build && pnpm test` |
| **Estimated runtime** | ~30 seconds (full suite incl. browser fake + byte-proof drill) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run <touched-package>` (quick command scoped)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite green + byte-proof drill PASS + 24h browser soak (RSS flat, zero zombie Chromium processes)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | SWM-03 | T-02-01 / — | — | unit | `pnpm vitest run packages/db-hot -- scratchpad` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | D-06 | T-02-02 / — | JINA_API_KEY required + redacted in logs | unit | `pnpm vitest run packages/config` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | D-08..D-15 | T-2-03 / — | — | unit | `pnpm vitest run packages/browser -- queue` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | ING-06 | T-02-04 / — | cheerio strip + turndown + 8k cap | unit | `pnpm vitest run packages/sanitize -- strip` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | ING-06 | — | byte-proof drill | integration | `pnpm vitest run packages/sanitize -- byteproof` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 2 | D-01/D-02/D-07 | — | fail-signal routing | unit | `pnpm vitest run packages/sanitize -- fetch` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 3 | SWM-01 | T-02-05 / — | — | unit | `pnpm vitest run packages/scout -- expiry` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 3 | SWM-01 | T-2-06 / — | — | unit | `pnpm vitest run packages/scout -- spam` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 4 | SC-1/SC-4 | — | tracer end-to-end | soak | `bash infra/oracle/drills/browser-soak.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/db-hot/src/scratchpad.ts` + `src/scratchpad.test.ts` — fake PB collection — SWM-03
- [ ] `packages/browser/` scaffold + `src/queue.test.ts` (fake Browser/Context) — D-08..D-15
- [ ] `packages/sanitize/` scaffold + `src/strip.test.ts`, `src/fetch.test.ts`, `src/byteproof.test.ts` — ING-06
- [ ] `packages/scout/` scaffold + `src/expiry.test.ts`, `src/spam.test.ts` — SWM-01
- [ ] `packages/config` env extension: `JINA_API_KEY` required + redaction test — D-06
- [ ] `infra/oracle/drills/browser-soak.sh` — 24h soak harness — SC-1
- [ ] Installs (first two behind `checkpoint:human-verify` per researcher SUS-on-recency): `playwright-core@^1.64`, `p-limit@^7`, `cheerio@^1.1`, `turndown@^7.2`, `date-fns@^4`, `date-fns-tz@^3`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Jina keyed live fetch against representative URL set | D-06 | network + key secret | Run `pnpm vitest run packages/sanitize -- fetch --live` with `JINA_API_KEY` set; expect `Title:/URL Source:/Markdown Content:` envelope |
| Representative URL byte-proof set (3–5 URLs) | SC-2 / D-05 | external portals change shape | Curate fixture list in `packages/sanitize/src/byteproof.test.ts`; record raw vs capped byte counts in VALIDATION.md sign-off |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
