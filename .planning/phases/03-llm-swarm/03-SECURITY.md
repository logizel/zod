---
phase: "03"
slug: "llm-swarm"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-16"
---

# Phase 03 — Security (LLM Swarm)

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Source artifacts: 03-01-PLAN.md, 03-02-PLAN.md, 03-03-PLAN.md (<threat_model> STRIDE registers).
> All 14 threats authored at plan time; dispositions verified against implementation (State B — run from artifacts).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| env → LLM provider | GROQ_API_KEY / GITHUB_TOKEN cross from env to Authorization header; leak risk in logs and token file | LLM provider API keys (secret) |
| provider → router | Untrusted model output (partial JSON, truncated stream) enters the stitcher; parse failures must stay loud | Model-generated JSON verdicts (untrusted) |
| router → agent_telemetry | Bucket state written to PocketBase; status transitions drive operator visibility and cool-down scheduling | Bucket status rows (internal) |
| scheduler → gateway | Cool-down timers registered in the single cron registry; mis-registration risks orphaned timers or silent bucket starvation | Cron job schedule (internal) |
| ladder → Tier2 | Overflow engages only after Tier1 exhausts; mis-configured tier gate risks premature Tier2 (rate-limit burn) or no fallback (verdict failure) | Tier selection (internal) |
| circuit-breaker → paid | Default-deny paid traffic; mis-configuration risks unauthorized spend (violates zero-cost constraint) | Projected spend vs budget (internal) |
| priority queue → pool | Curator preemption risks Scout starvation under sustained load; global in-flight cap prevents deadlock | Job enqueue/dequeue (internal) |
| provider adapters → keys | Each adapter holds an API key; key material must never leave the process or reach logs | Adapter API keys (secret) |
| scheduler → gateway timers | Bucket cool-down / daily-cap reset jobs in the cron registry; mis-firing risks premature recovery (rate-limit burn) or stuck buckets (verdict failure) | Timer schedule (internal) |
| gateway → agent_telemetry | Operator reads bucket state from telemetry rows; stale/wrong status misleads the operator about pool health | Bucket status rows (internal) |
| gateway entry → env | Fail-fast on missing keys; partial key set must not start partial traffic | Env parse at boot (secret-gated) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Info disclosure | LLM provider keys in logs (GROQ_API_KEY, GITHUB_TOKEN, SAMBANOVA_API_KEY) | high | mitigate | pino REDACT_PATHS redacts GROQ_API_KEY/GITHUB_TOKEN/SAMBANOVA_API_KEY; env.parse() fail-fast; keys never persisted in scratchpad rows | closed |
| T-03-02 | Tampering | Truncated/partial JSON verdict accepted | high | mitigate | Stitch validates merged output with JSON.parse; invalid → surface as UNVERIFIED, never route a malformed verdict | closed |
| T-03-03 | Denial of service | Bucket stuck in 60s-COOLDOWN / DAILY-CAP | medium | mitigate | Time-driven recovery (cooldownUntil timestamp, daily-cap resets at UTC midnight); router skips unavailable buckets, never blocks the caller | closed |
| T-03-04 | Denial of service | Orphaned cool-down timers bypassing registry | medium | mitigate | All bucket timers route through packages/scheduler/src/registry.ts (noOverlap + maxRandomDelay); no setInterval in packages/llm | closed |
| T-03-05 | Repudiation | Audit trail lost (which bucket produced verdict) | low | mitigate | LlmRouter.complete() returns `path` listing every bucket attempted; telemetry rows record provider/model/step/status | closed |
| T-03-06 | Denial of service | Tier2 engaged prematurely (Tier1 still READY) | medium | mitigate | tier1Available() gate; router test asserts Tier2 only when all Tier1 COOLDOWN/DAILY-CAP | closed |
| T-03-07 | Financial | Unauthorized paid traffic (SambaNova/paid Tier2) | high | mitigate | circuit-breaker default-deny; paid traffic requires SAMBANOVA_API_KEY + explicit opt-in; zero-cost budget enforced | closed |
| T-03-08 | Denial of service | Scout bursts starve Curator (shared-pool deadlock) | high | mitigate | PriorityQueue Curator(1) > Scout(3); per-lane + global in-flight caps; chaos test under mixed load | closed |
| T-03-09 | Tampering | Cerebras added to bucket table by mistake | high | mitigate | ladder.test.ts 'no Cerebras' assertion fails CI if any Cerebras model ID appears in Tier1 or Tier2 | closed |
| T-03-10 | Denial of service | Cooldown timer fires early (bucket recovers before 60s) | medium | mitigate | Registry job uses cooldownUntil timestamp; bucket.canFire() checks now >= cooldownUntil; clock integrity | closed |
| T-03-11 | Info disclosure | Stale telemetry status misleads operator | low | mitigate | writeBucketState upserts on every transition; readBucketState returns latest row; status transitions tested | closed |
| T-03-12 | Denial of service | Gateway starts with incomplete key set (partial traffic) | high | mitigate | parseEnv() fail-fast: GROQ_API_KEY + GITHUB_TOKEN required before LlmRouter constructs; process exits on missing | closed |
| T-03-13 | Repudiation | Audit trail incomplete (path missing buckets) | low | mitigate | router `path[]` records every bucket + tier attempted; telemetry rows record provider/model/status | closed |
| T-03-14 | Repudiation | Audit trail incomplete across scheduler + gateway | low | mitigate | router `path[]` + telemetry rows record every bucket/provider/model/status transition | closed |

**Register summary:** 14 threats total (T-03-01 … T-03-14). Dispositions: 14 mitigate, 0 accept, 0 transfer.
**Severity breakdown:** 6 high, 4 medium, 4 low.
**threats_open: 0** — every threat has a verified mitigation in place; none open at or above the `workflow.security_block_on` ("high") blocking gate.
**register_authored_at_plan_time: true** — all three PLAN files contained parseable `<threat_model>` blocks.

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Mitigation Verification Evidence

Each mitigation below was confirmed present in the implementation (grep-verified against the committed codebase) and covered by passing tests documented in the plan SUMMARYs:

| Threat | Mitigation in place | Evidence (committed code) | Test coverage |
|--------|---------------------|---------------------------|---------------|
| T-03-01 | Keys redacted in logs | `packages/logger/src/index.ts` REDACT_PATHS includes GROQ_API_KEY/GITHUB_TOKEN/SAMBANOVA_API_KEY | env + logger vitest configs inject keys |
| T-03-02 | Merged output JSON.parse-validated | `packages/llm/src/stitch.ts` Stitcher.continue(); router returns UNVERIFIED on invalid merge | router.test.ts / chaos.test.ts finish_reason:length |
| T-03-03 | Time-driven cooldown recovery; caller never blocked | `packages/llm/src/bucket.ts` cooldownUntil timestamp; canFire() gate | bucket.test.ts state machine |
| T-03-04 | Single scheduler registry owns timers; no setInterval | `packages/scheduler/src/registry.ts` registerGatewayJobs; no setInterval in packages/llm | registry.test.ts noOverlap + jitter |
| T-03-05 | path[] audit trail | `packages/llm/src/router.ts` complete() returns path listing every bucket | router.test.ts path assertion |
| T-03-06 | tier1Available() gate blocks premature Tier2 | `packages/llm/src/ladder.ts` tier1Available(); router consults gate | router.test.ts Tier1/Tier2 gate |
| T-03-07 | circuit-breaker default-deny paid traffic | `packages/llm/src/circuit-breaker.ts` evaluate() → PARK default; zero-cost budget | circuit-breaker default-deny tests |
| T-03-08 | Priority lanes Curator > Scout; in-flight caps | `packages/llm/src/priority.ts` PriorityQueue per-lane + global caps | priority queue tests / chaos mixed load |
| T-03-09 | No-Cerebras lint assertion fails CI | `packages/llm/src/ladder.ts` assertNoCerebras(); enforced in router constructor | ladder.test.ts 'no Cerebras' |
| T-03-10 | cooldownUntil clock integrity; canFire() check | `packages/scheduler/src/registry.ts` + `packages/llm/src/registry-integration.ts` | registry.test.ts boot assertion |
| T-03-11 | Upsert-on-transition; read latest row | `packages/llm/src/telemetry.ts` writeBucketState upsert; readBucketState | telemetry.test.ts READY → 60s-COOLDOWN → READY |
| T-03-12 | parseEnv fail-fast before LlmRouter | `packages/llm/src/gateway-entry.ts` parseEnv() → createLogger() → LlmRouter | gateway-entry boot order |
| T-03-13 | path[] records every bucket + tier | `packages/llm/src/router.ts` tier-prefixed path; UNVERIFIED on exhaustion | router.test.ts fallback matrix |
| T-03-14 | path[] + telemetry rows across scheduler + gateway | `packages/llm/src/router.ts` + `packages/llm/src/telemetry.ts` | router + telemetry tests |

All Phase 3 plans executed (VERIFICATION.md status: passed); all SUMMARY.md self-checks passed; all commits on disk.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

*No accepted risks. All 14 threats carry disposition "mitigate" with verified implementations.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-16 | 14 | 14 | 0 | gsd-secure-phase executor (State B: run from PLAN threat models) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (none)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-16
