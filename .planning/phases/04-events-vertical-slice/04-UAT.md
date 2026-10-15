---
status: complete
phase: 04-events-vertical-slice
source: 04-01-PLAN-SUMMARY.md, 04-02-PLAN-SUMMARY.md, 04-03-PLAN-SUMMARY.md
started: 2026-10-16T12:00:00Z
updated: 2026-10-16T12:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running bot process. Clear ephemeral state (node_modules/.cache, temp DBs, lock files). Start the application from scratch (`pnpm build` then `pnpm test`). tsc -b exits 0 with zero errors; vitest suite returns green (210/210). No startup race, no silent seed failure, no missing env.
result: pass

### 2. Link-Hopper 2-hop Resolution
expected: Aggregator URL resolves to official event domain within max 2 hops via native fetch redirect:'manual'; SSRF guard rejects private/loopback hop targets; hop exhaustion returns ok=false (tombstoned as link_hop_failed).
result: pass

### 3. 80/20 Domain Filter
expected: SWE domains (github.com, gitlab.com, etc.) pass outright from title/snippet; deep-tech adjacent domains pass only at organizer≥9 AND agenda≥9; non-technical business events rejected before any auditor call.
result: pass

### 4. Prize Gate (₹1L Verified Cash)
expected: Explicit INR prize_cash_inr ≥₹1,00,000 passes; prize_cash_inr null (TBA/unverified) rejects; credits/vouchers/certificates keywords strip the claim regardless of stated amount; "₹5L prize" credit-inflated event does not qualify.
result: pass

### 5. Discord Audit Card Embed (UI-01)
expected: buildAuditCard() produces EmbedBuilder with all 6 fields: title, Organizer, Dates, Prize (liquid cash), Links [Official + Aggregator], 1-line Audit from audit_summary.
result: pass

### 6. CTFtime Portal Adapter
expected: list() emits PollCandidate[] with url + title + snippet from the CTFtime JSON API listing only; no markdown, no full fetch, no description_raw fields; since filtering works.
result: pass

### 7. Seven Portal Adapters Wired
expected: All 7 national portals (CTFtime, CLIST.by, Unstop, Devfolio, Devpost, Luma, Meetup) have dedicated parsers; each emits title+snippet from listing first (Scout pre-filter, zero fetch); API mode for CTFtime + CLIST.by, scrape mode for the other 5.
result: pass

### 8. Staggered 7-Portal Cron
expected: 7 portal-poll cron entries registered through the single scheduler registry across the 15–30m window with 5-minute offsets in Asia/Kolkata, noOverlap: true, maxRandomDelayMs: 5min jitter — no thundering herd.
result: pass

### 9. Discord Router Service (processOpportunity)
expected: Audited opportunity flows buildAuditCard → channel.send → pb.update(status='routed'); recordFailure retry (5 → tombstone discord_post_failed) on send failure; channel-not-found skips without stopping the poll loop.
result: pass

### 10. Discord Gateway Login
expected: parseEnv() fail-fast gate requires DISCORD_TOKEN (throws before any discord.js Client constructs); client.login(env.DISCORD_TOKEN) establishes Gateway connection; token redacted as [Redacted] in all pino logs via REDACT_PATHS.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
