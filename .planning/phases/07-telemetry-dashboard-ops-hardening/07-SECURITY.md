---
phase: "07"
slug: telemetry-dashboard-ops-hardening
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-18"
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Phase 07 (Telemetry Dashboard + Ops Hardening) executed across 3 waves / 3 plans (07-01, 07-02, 07-03), all complete. Threat register authored at plan time in the three `*-PLAN.md` `<threat_model>` blocks (register_authored_at_plan_time: true). ASVS level 1 — L1 grep-depth verification sufficient; mitigations confirmed present via plan summaries, unit tests, and drill scripts.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → Cloudflare Pages dashboard | Unauthenticated user requests the static UI; Zero Trust Access gate must reject before render (DSH-01) | UI (unauthenticated) |
| Browser → SSE stream via tunnel | Unauthenticated EventSource connection; Zero Trust Access must reject before stream connects (DSH-01) | SSE stream (unauthenticated) |
| Stream server → PocketBase | Loopback-only PB on 127.0.0.1:8090; service-account credentials never logged | service-account credentials |
| Stream server → Turso (cold reads) | Remote Turso via auth token; token only from env, never in code (Pitfall 14) | Turso auth token |
| Dashboard filter UI → GET /api/boards | Filter params are untrusted client input; must be validated before querying PocketBase | filter query params |
| Browser → Turso "load older" | Cold ledger read via tunnel; must not expose write path or hot DB | tombstone_ledger point lookup |
| Stream server → Discord #🛠-ops-health | Ops alert messages; bot token only from env, never logged | Discord alert text |
| Dashboard client → stream server reconnect | Reconnect storm risk on tunnel flap; viewer cap bounds SSE cost | SSE connections |
| GC → #🛠-ops-health alert | GC failure signal must not leak secrets or crash the scheduler | GC telemetry/alert |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-07-01 | Spoofing / Information Disclosure | Zero Trust Access edge gate (dashboard + SSE) | critical | mitigate | Cloudflare Access owner-email Allow + deny-by-default covers both hostnames; unauth rejected at edge before UI/SSE render (D-04); proven by edge-reject.sh --local (5/5 preconditions) | closed |
| T-07-02 | Denial of Service | SSE fan-out / reconnect storm | medium | mitigate | Single shared PB subscription regardless of viewer count (D-06); viewer cap ~2 (D-08); exponential backoff + jitter reconnect (D-08) | closed |
| T-07-03 | Information Disclosure | Secret leakage in stream server logs / env | high | mitigate | Redacting logger strips Authorization/Cookie/token/key; secrets only via parseEnv env (Pitfall 14); .env never committed; env-drift bijection + secrets-hygiene grep clean | closed |
| T-07-04 | Denial of Service | GC silent failure → hot DB fill / tombstone growth | high | mitigate | GC telemetry event with counts + 25h-missing alert (D-14); idempotent re-run (Pitfall 11); heavy-text columns only purge (D-13) | closed |
| T-07-SC | Tampering | npm/pip/cargo installs | high | mitigate | No new npm packages in Phase 7 (D-02 zero-deps UI; stream server uses existing verified workspace deps); package-legitimacy gate if any added | closed |
| T-07-05 | Information Disclosure | GET /api/boards filter params | medium | mitigate | zod Schema.parse() on all filter params; invalid → 400; no raw SQL/string interpolation (boards.test.ts invalid-param 400 test) | closed |
| T-07-06 | Tampering | Turso tombstone_ledger "load older" | medium | mitigate | Read-only point lookup (lookupTombstone, INSERT OR IGNORE only writes); no mutation endpoint exposed via tunnel (GET /api/audit/older) | closed |
| T-07-07 | Information Disclosure | Bucket state / slot telemetry exposure | low | accept | Telemetry is read-only operational data; owner-only Zero Trust already gates access (T-07-01) — accepted low risk | closed |
| T-07-08 | Information Disclosure | Discord bot token in alerts code/logs | high | mitigate | resolveChannel reads channel ID from env only; bot token never in dashboard-server code; redacting logger strips tokens (Pitfall 14) | closed |
| T-07-09 | Denial of Service | SSE reconnect storm after tunnel flap | medium | mitigate | Exponential backoff + jitter (D-08); viewer cap ~2 (D-08); single shared PB subscription (D-06) | closed |
| T-07-10 | Denial of Service | GC silent failure → stale dash / hot DB growth | high | mitigate | GC telemetry event + 25h-missing alert (D-14); idempotent re-run (Pitfall 11); kill-tests prove recovery (kill-cloudflared.sh, gc-verify.sh, tunnel-restart-recovery.sh) | closed |

*Status: open · closed · open — below block_on threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-07-01 | T-07-07 | Low-severity read-only telemetry exposure; owner-only Zero Trust (T-07-01) already gates access; no additional implementation required | gsd-secure-phase (orchestrator) | 2026-10-18 |

*Accepted risks do not resurface in future audit runs.*
*If none: "No accepted risks."*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-18 | 11 | 11 | 0 | gsd-secure-phase (orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-18
