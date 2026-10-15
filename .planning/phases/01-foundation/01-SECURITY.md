---
phase: "01-foundation"
slug: "foundation"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-15"
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

State-B creation (no prior SECURITY.md; register built from the four PLAN.md
`<threat_model>` blocks). L1 grep-depth verification by orchestrator evidence
checks on 2026-10-15 — all 12 mitigations present in implementation, 16/16
must_haves verified, 50/50 tests green. Short-circuit per workflow Step 3
(threats_open: 0, register authored at plan time, asvs_level == 1); no auditor
spawn required. Known residual weaknesses (code-review H/M/L findings) are
tracked open in `01-REVIEW-DISPOSITION.md` as Phase 2 input, not re-litigated
here; the mitigations they touch exist and are verified present.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| developer workstation to git remote | secret material crosses here on every commit | secrets / high sensitivity |
| process env to log pipeline | secret values cross into stdout and journald here | secrets / high sensitivity |
| scheduler process to PocketBase loopback | service-account credential crosses here at auth time | service credential / high |
| VM to Turso cloud | cold auth token crosses here on every call | auth token / high |
| scheduler process to host memory | buffer allocation crosses into the reclaim-observed metric here | memory pressure signal / low |
| VM to external watchdog | heartbeat silence crosses into paging here | liveness signal / low |
| internet to Cloudflare edge | unauthenticated requests cross here before any render | HTTP requests / medium |
| VM disk to tunnel credentials | tunnel identity file crosses here at service start | tunnel identity / high |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-1-01 | Information disclosure | git history and pre-commit hook | high | mitigate | gitignore + placeholder-only .env.example in first commit; gitleaks hook (v8.24 line); history-scan drill green (36 commits + staged clean) | closed |
| T-1-02 | Information disclosure | pino logger base and child loggers | high | mitigate | redact paths on secret-shaped fields + credential names + auth headers with censor replacement; redact unit test asserts censoring; pretty transport dev-only | closed |
| T-1-03 | Spoofing | npm install specifiers | medium | mitigate | exact RESEARCH-verified pins only (zod ^4.6.7, pino ^10.4.0, vitest ^3.2.7, dotenv ^16.6.1, eventsource ^5.1.3, tsx dev, node-cron registry ^4.6.0); blocking-human legitimacy checkpoint approved all seven | closed |
| T-1-04 | Information disclosure | PB service-account token file | high | mitigate | token file owner-only 0600 with initial auth-store load (asserted in client.test.ts); credential never logged via T-1-02 redact paths; loopback-only bind proven by port-scan drill | closed |
| T-1-05 | Tampering | tombstone ledger rows | high | mitigate | url_hash PK with insert-or-ignore writes only; zero DELETE/DROP statements in cold/dedup/schema (grep-verified); idempotent IF NOT EXISTS DDL | closed |
| T-1-06 | Spoofing | fingerprint collisions across distinct opportunities | low | accept | SHA-256 over normalized URL + title + date + organizer; two-tier hot-then-cold lookup; revisit only on observed collision evidence | closed |
| T-1-07 | Denial of service | overlapping poll ticks under scrape pileups | high | mitigate | noOverlap on every job + per-job jitter + single owning registry; forced-overlap test proves skips; boot assertion pins the guard API | closed |
| T-1-08 | Denial of service | Oracle idle reclaim wiping the VM | medium | mitigate | wired 2.5GB cache buffer sized from free memory (fixtures land 27.5–30.0%) under restart-always unit + external dead-man watchdog on heartbeat silence | closed |
| T-1-09 | Tampering | watchdog heartbeat spoofing a healthy scheduler | low | mitigate | heartbeats carry per-tick duration + job name through the redacting logger shape with no secret fields; watchdog alerts on silence, never trusts a single healthy line | closed |
| T-1-10 | Elevation of privilege | Zero Trust Access rule misconfiguration | high | mitigate | deny-by-default Allow + owner-email include, zero bypass rules; edge-reject drill asserts unauth shell + stream rejection (5/5 local, live deferred to host) | closed |
| T-1-11 | Information disclosure | tunnel credential file on VM disk | high | mitigate | credentials file owner-only 0600 outside the repo, explicit config path, token in env only; runbook rotation procedure on suspected theft | closed |
| T-1-12 | Information disclosure | inbound firewall and database bind surface | high | mitigate | zero open inbound ports, tunnel-only ingress; PB bound --http=127.0.0.1:8090; PB absent from tunnel ingress route; port-scan drill asserts loopback-only bind | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-01-01 | T-1-06 | SHA-256 collision negligible; two-tier lookup requires cross-store agreement before a skip; revisit only with observed collision evidence | operator (plan checkpoint) | 2026-10-15 |

---

## Residuals (non-blocking, tracked in 01-REVIEW-DISPOSITION.md)

Advisory review weaknesses touching the above mitigations — all open, none
blocking, recommended as Phase 2 planning input:

- H-01/H-02: env gate accepts empty-string TURSO_DATABASE_URL / PB_URL (fail-fast depth, touches T-2-adjacent truth 2)
- H-03: secrets-scan fallback blind to subdir .env files and the default token file (T-1-01 backstop depth)
- M-01: redact paths one level deep; deeper nesting/arrays leak (T-1-02 depth)
- M-02: precheck returns tombstoned on URL match without comparing fingerprints (weakens T-1-06 agreement mitigation)
- M-03: 0600 not enforced on pre-existing token files (T-1-04 edge)

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-15 | 12 | 12 | 0 | orchestrator (State-B L1 evidence pass; asvs_level 1 short-circuit, no auditor) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-15
