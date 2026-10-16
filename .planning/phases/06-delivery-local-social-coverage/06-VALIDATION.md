---
phase: "6"
slug: "delivery-local-social-coverage"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-16"
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3 |
| **Config file** | vitest.config.ts (per-package) |
| **Quick run command** | `pnpm vitest run --filter <package>` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --filter <package>`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | ING-02 | T-6-01 / — | N/A | unit | `pnpm vitest run --filter @zod/discord-router -t "local source"` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | ING-04 | T-6-02 / — | N/A | unit | `pnpm vitest run --filter @zod/discord-router -t "relay"` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | ING-05 | T-6-03 / — | N/A | unit | `pnpm vitest run --filter @zod/discord-router -t "social source"` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | EVT-03 | — | N/A | unit | `pnpm vitest run --filter @zod/orchestrator -t "local routing"` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | EVT-04 | — | N/A | unit | `pnpm vitest run --filter @zod/orchestrator -t "travel routing"` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 2 | EVT-06 | — | N/A | unit | `pnpm vitest run --filter @zod/orchestrator -t "tba loop"` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 3 | UI-02 | — | N/A | unit | `pnpm vitest run --filter @zod/discord-router -t "bookmark"` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 3 | UI-02 | — | N/A | unit | `pnpm vitest run --filter @zod/discord-router -t "reminder"` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 4 | MEM-04 | — | N/A | unit | `pnpm vitest run --filter @zod/discord-router -t "taste ingest"` | ❌ W0 | ⬜ pending |
| 06-04-02 | 04 | 4 | MEM-04 | — | N/A | unit | `pnpm vitest run --filter @zod/orchestrator -t "taste apply"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/discord-router/src/portals/local.test.ts` — covers ING-02, EVT-03
- [ ] `packages/discord-router/src/portals/social.test.ts` — covers ING-05
- [ ] `packages/discord-router/src/relay.test.ts` — covers ING-04
- [ ] `packages/discord-router/src/bookmark.test.ts` — covers UI-02
- [ ] `packages/discord-router/src/reminder.test.ts` — covers UI-02
- [ ] `packages/discord-router/src/taste-ingest.test.ts` — covers MEM-04
- [ ] `packages/orchestrator/src/tba-loop.test.ts` — covers EVT-06
- [ ] `packages/orchestrator/src/taste-apply.test.ts` — covers MEM-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Custom bookmark emoji rendering | UI-02 | Emoji must be created on Discord server first | Create emoji on server, verify bot detects reaction by emoji ID |
| X/LinkedIn cookie export | ING-05 | Cookies must be exported from burner browser session | Export cookies from burner browser, verify file format matches parser |
| External #announcements relay end-to-end | ING-04 | Requires real external Discord channel | Post in external #announcements, verify relay to #raw-incoming-feeds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
