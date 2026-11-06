---
phase: "6"
slug: "delivery-local-social-coverage"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-16"
validated: "2026-11-06"
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3 |
| **Config file** | vitest.config.ts (root workspace) + per-package configs |
| **Quick run command** | `pnpm exec vitest run <test-file>` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run the relevant package test file
- **After every plan wave:** Run `pnpm test`
- **Before phase verification:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | ING-02 | T-6-01 / — | N/A | unit | `pnpm exec vitest run packages/discord-router/src/portals/local.test.ts` | ✅ | ✅ green |
| 06-01-02 | 01 | 1 | ING-04 | T-6-02 / — | N/A | unit | `pnpm exec vitest run packages/discord-router/src/relay.test.ts` | ✅ | ✅ green |
| 06-01-03 | 01 | 1 | ING-05 | T-6-03 / — | N/A | unit | `pnpm exec vitest run packages/discord-router/src/portals/social.test.ts` | ✅ | ✅ green |
| 06-02-01 | 02 | 2 | EVT-03 | — | N/A | unit | `pnpm exec vitest run packages/orchestrator/src/rule-packs/local.test.ts` | ✅ | ✅ green |
| 06-02-02 | 02 | 2 | EVT-04 | — | N/A | unit | `pnpm exec vitest run packages/orchestrator/src/rule-packs/local.test.ts` | ✅ | ✅ green |
| 06-02-03 | 02 | 2 | EVT-06 | — | N/A | unit | `pnpm exec vitest run packages/orchestrator/src/tba-loop.test.ts` | ✅ | ✅ green |
| 06-03-01 | 03 | 3 | UI-02 | — | N/A | unit | `pnpm exec vitest run packages/discord-router/src/bookmark.test.ts` | ✅ | ✅ green |
| 06-03-02 | 03 | 3 | UI-02 | — | N/A | unit | `pnpm exec vitest run packages/discord-router/src/reminder.test.ts` | ✅ | ✅ green |
| 06-04-01 | 04 | 4 | MEM-04 | — | N/A | unit | `pnpm exec vitest run packages/discord-router/src/taste-ingest.test.ts` | ✅ | ✅ green |
| 06-04-02 | 04 | 4 | MEM-04 | — | N/A | unit | `pnpm exec vitest run packages/orchestrator/src/taste-apply.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Validation evidence (2026-11-06):** targeted run of the nine files above at `b9b4de1` → **9 files, 108 tests passed**. Full root suite → **73 files, 722 tests passed**.

---

## Wave 0 Requirements

- [x] `packages/discord-router/src/portals/local.test.ts` — covers ING-02, EVT-03
- [x] `packages/discord-router/src/portals/social.test.ts` — covers ING-05
- [x] `packages/discord-router/src/relay.test.ts` — covers ING-04
- [x] `packages/discord-router/src/bookmark.test.ts` — covers UI-02
- [x] `packages/discord-router/src/reminder.test.ts` — covers UI-02
- [x] `packages/discord-router/src/taste-ingest.test.ts` — covers MEM-04
- [x] `packages/orchestrator/src/tba-loop.test.ts` — covers EVT-06
- [x] `packages/orchestrator/src/taste-apply.test.ts` — covers MEM-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Result |
|----------|-------------|------------|-------------------|--------|
| Custom bookmark emoji rendering | UI-02 | Emoji must be created on Discord server first | Create emoji on server, verify bot detects reaction by emoji ID | ✅ pass (`06-UAT.md` #2) |
| X/LinkedIn cookie export | ING-05 | Cookies must be exported from burner browser session | Export cookies from burner browser, verify file format matches parser | ✅ pass (`06-UAT.md` #3) |
| External #announcements relay end-to-end | ING-04 | Requires real external Discord channel | Post in external #announcements, verify relay to #raw-incoming-feeds | ✅ pass (`06-UAT.md` #4) |
| Operator authorization configuration | MEM-04 | Security configuration decision | Configure `OPERATOR_USER_IDS`; verify non-operators are rejected | ✅ pass (`06-UAT.md` #1) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-06 — evidence: `pnpm build` green; root suite 722/722; targeted Phase 6 suite 108/108; `06-UAT.md` 4/4 pass.
