---
phase: "04"
slug: "events-vertical-slice"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-16"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | vitest `^3` |
| **Config file** | per-package `vitest.config.ts` (copy from `packages/scheduler`) |
| **Quick run command** | `pnpm vitest run packages/discord-router` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run packages/discord-router`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 | 01 | 1 | ING-01 | T-04-01 / — | Portal adapters emit title+snippet from listing only; no full fetch before Scout pass | unit | `pnpm vitest run packages/discord-router/src/portals` | ❌ W0 | ⬜ pending |
| 01-02 | 01 | 1 | SWM-02 | T-04-02 / — | Link-Hopper resolves official domain within 2 hops; tombstones `link_hop_failed` on failure | unit | `pnpm vitest run packages/discord-router/src/link-hop.test.ts` | ❌ W0 | ⬜ pending |
| 01-03 | 01 | 1 | EVT-02 | T-04-03 / — | 80/20 domain filter rejects non-technical business before auditor | unit | `pnpm vitest run packages/discord-router/src/domain-filter.test.ts` | ❌ W0 | ⬜ pending |
| 01-04 | 01 | 1 | EVT-05 | T-04-04 / — | Verified liquid cash ≥₹1L INR; credits stripped; null ≠ pass | unit | `pnpm vitest run packages/discord-router/src/prize-gate.test.ts` | ❌ W0 | ⬜ pending |
| 01-05 | 01 | 1 | UI-01 | T-04-05 / — | EmbedBuilder audit card with title/organizer/dates/prize/links/audit_summary | unit | `pnpm vitest run packages/discord-router/src/embed.test.ts` | ❌ W0 | ⬜ pending |
| 02-01 | 02 | 2 | ING-01 | T-04-06 / — | 7 staggered portal-poll cron jobs registered via single scheduler registry | unit | `pnpm vitest run packages/scheduler` | ✅ | ⬜ pending |
| 02-02 | 02 | 2 | UI-01 | T-04-07 / — | Discord router polls `status='audited'` + `bucket_channel`, posts embed, marks `routed` | unit | `pnpm vitest run packages/discord-router/src/router-service.test.ts` | ❌ W0 | ⬜ pending |
| 02-03 | 02 | 2 | UI-01 | T-04-08 / — | `DISCORD_TOKEN` required at boot, redacted in all logs | unit | `pnpm vitest run packages/config` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/discord-router/` package scaffold (package.json, tsconfig, vitest.config) — stubs for ING-01/SWM-02/EVT-01/EVT-02/EVT-05/UI-01
- [ ] `packages/discord-router/src/link-hop.test.ts` — covers SWM-02
- [ ] `packages/discord-router/src/domain-filter.test.ts` — covers EVT-01/EVT-02
- [ ] `packages/discord-router/src/prize-gate.test.ts` — covers EVT-05
- [ ] `packages/discord-router/src/embed.test.ts` — covers UI-01
- [ ] `packages/discord-router/src/portals/` adapter tests — covers ING-01
- [ ] Framework install: `pnpm add discord.js`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Discord gateway login + Message Content Intent enabled | UI-01 | Requires live Discord bot application and privileged intent toggle | Create Discord app, enable Message Content Intent, add DISCORD_TOKEN to env, run router, confirm `ready` event |
| End-to-end alert: portal poll → Scout → Link-Hopper → auditor → Discord card → routed | ING-01, SWM-02, EVT-01, EVT-02, EVT-05, UI-01 | Requires live PocketBase instance + Discord channel + real portal listings | Run full pipeline with one candidate URL; confirm card appears in correct channel and status flips to `routed` |
| prize_cash_inr null (TBA) does not pass ₹1L gate | EVT-05 | Requires live portal data with credit-inflated prizes | Submit a credit-inflated "₹5L prize" event; confirm it does not appear in #💻-online-1lakh-plus |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
