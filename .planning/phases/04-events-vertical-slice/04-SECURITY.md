---
phase: "04"
slug: "events-vertical-slice"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-16"
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Portal listings → adapter | Untrusted external event data from national portals enters the ingestion pipeline | Public event titles/snippets/URLs |
| Link-Hopper redirect following | HTTP Location headers from external servers are followed; SSRF risk on hop targets | HTTP redirect Location headers |
| Discord bot token | DISCORD_TOKEN is the sole auth for the Discord Gateway; leakage impersonates the alert system | Bot credential (high sensitivity) |
| Discord gateway connection | Outbound WebSocket to Discord Gateway; bot must be in target guild with channel permissions | Gateway session |
| PocketBase writes | Service-account PB writes transition status audited→routed; replay could duplicate alerts | Opportunity records |
| Portal listings → 7 adapters | Untrusted HTML/JSON from 6 additional national portals enters the ingestion pipeline | Public event listings |
| Scheduler cron ticks | 7 staggered polls share the single scheduler registry; overlap could stampede the shared browser | Cron tick scheduling |
| Headless browser fallback | Scrape-mode portals use the shared Playwright singleton — tab exhaustion risk | Browser tabs |
| Discord gateway login | Bot token transmitted to Discord Gateway; token must never appear in logs or code | Bot credential |
| Discord channel send | EmbedBuilder audit cards posted to guild channels; wrong channel = misrouted alerts | Audit card embeds |
| PocketBase status transition | audited→routed write must only happen after successful Discord post | Opportunity status |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 | Spoofing | Discord bot token (DISCORD_TOKEN) | high | mitigate | Env-only secret via zod EnvSchema.parse fail-fast; DISCORD_TOKEN in REDACT_PATHS; .env gitignored; .env.example placeholders only | closed |
| T-04-02 | Tampering | Link-Hopper redirect following (link-hop.ts) | high | mitigate | validateUrl SSRF guard on every hop target (rejects private/loopback, non-80/443 ports); max 2 hops; failed resolution → tombstone link_hop_failed | closed |
| T-04-03 | Repudiation | Discord router status transition (router-service.ts) | medium | mitigate | Router service marks status='routed' after successful embed post; failed posts retry via recordFailure (5 → tombstone), preventing duplicate posts | closed |
| T-04-04 | Information Disclosure | Logger output (packages/logger/src/index.ts) | high | mitigate | DISCORD_TOKEN and all token-like keys in REDACT_PATHS; pino redaction serializes secrets as [Redacted] | closed |
| T-04-05 | Denial of Service | Scheduler cron overlap (packages/scheduler/src/registry.ts) | medium | mitigate | Single scheduler registry with noOverlap: true; execution:overlap skip + telemetry counter; stagger cron offsets across 15–30m window | closed |
| T-04-06 | Elevation of Privilege | 80/20 domain filter (domain-filter.ts) | medium | mitigate | Pre-filter runs before auditor (D-11); non-technical business rejected at entry; SWE admit-all, deep-tech only at organizer>=9 AND agenda>=9 | closed |
| T-04-07 | Denial of Service | 7 concurrent portal polls (jobs.ts STUB_JOBS) | high | mitigate | Staggered cron offsets across 15–30m window (D-02); noOverlap: true per job; maxRandomDelayMs jitter; single scheduler registry owns all cron.schedule() calls | closed |
| T-04-08 | Denial of Service | Shared browser tab exhaustion (scrape-mode portals via packages/browser) | medium | mitigate | Scrape-mode only for 5 portals without free APIs; api-mode for CTFtime + CLIST.by; max 2–3 tabs, media off, FIFO close discipline | closed |
| T-04-09 | Information Disclosure | Portal listing data in logs | low | accept | Listing titles/snippets are public event data; no secrets in adapter output; pino child loggers do not log raw portal HTML | open — below block threshold |
| T-04-10 | Spoofing | Discord bot login (gateway.ts Client.login) | high | mitigate | DISCORD_TOKEN from env only, fail-fast parseEnv before Client construction, never hardcoded; bot authenticates via official discord.js Client to Discord Gateway | closed |
| T-04-11 | Tampering | Status transition audited→routed (router-service.ts) | medium | mitigate | status='routed' written only after channel.send succeeds; failed posts retry via recordFailure, never silently skip or partial-update | closed |
| T-04-12 | Information Disclosure | Discord token in logs (gateway.ts, router-service.ts) | high | mitigate | DISCORD_TOKEN in REDACT_PATHS; pino redacts all token-like fields as [Redacted]; no token in error messages or stack traces | closed |
| T-04-13 | Denial of Service | Router poll loop crash on single item failure | medium | mitigate | Per-item try/catch isolates failures; one failed Discord post does not stop the poll loop; recordFailure isolates per-item failures | closed |
| T-04-SC | Tampering | npm install (discord.js) | high | accept | Package-legitimacy gate: discord.js [OK] per 04-RESEARCH.md Package Legitimacy Audit; blocking human checkpoint for any [ASSUMED]/[SUS] package | open — below block threshold |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| T-04-09 | T-04-09 | Portal listing titles/snippets are public event data; no secrets in adapter output; pino child loggers do not log raw portal HTML | GSD secure-phase | 2026-10-16 |
| T-04-SC | T-04-SC | Package-legitimacy gate verified discord.js [OK] in 04-RESEARCH.md; blocking human checkpoint for any [ASSUMED]/[SUS] package | GSD secure-phase | 2026-10-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-16 | 13 | 11 | 2 | gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed (no open threats at or above `high` threshold)
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-16
