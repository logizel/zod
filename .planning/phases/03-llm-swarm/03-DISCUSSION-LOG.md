# Phase 3: LLM Swarm - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 3-llm-swarm
**Areas discussed:** Bucket state persistence & restart survival, 429/413 detection mechanism, Length-stitch ownership, Cerebras disable enforcement

---

## Bucket state persistence & restart survival

| Option | Description | Selected |
|--------|-------------|----------|
| agent_telemetry via PocketBase | Persists bucket state and streams via SSE to dashboard (MEM-02); schema already has a 'cooldown' telemetry status. Satisfies success criterion #4 with no new store, but adds DB write latency to the hot audit path. | ✓ |
| In-memory only | Simplest, zero DB latency on the hot audit path — best for efficiency and performance. State is lost on restart; telemetry visible only while running. | |
| You decide | Agent picks the persistence approach (agent discretion). | |

**User's choice:** agent_telemetry via PocketBase
**Notes:** Recommended per the user's efficiency+requirements rule — it's the only option satisfying success criterion #4 (operator visibility via SSE telemetry) and restart survival on Oracle idle reclaim. In-memory rejected because it fails restart-survival and visibility requirements despite lower latency.

---

## 429/413 detection mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Vendor SDK error types | Per-vendor typed errors (e.g., groq-sdk RateLimitError + Retry-After header). Precise detection (fewer false cooldowns), respects Retry-After for accurate 60s cool-down, satisfies SWM-04 exactly. More adapter code per vendor. | ✓ |
| Generic HTTP status inspection | Uniform status-code check across all vendors. Simpler, one code path, but less precise — risks false/missed 429/413 triggers and no Retry-After parsing. Satisfies SWM-04 loosely. | |
| You decide | Agent picks the detection approach. | |

**User's choice:** Vendor SDK error types
**Notes:** Recommended per the user's efficiency+requirements rule — precise detection, respects Retry-After, satisfies SWM-04 exactly. Generic HTTP simpler but risks false/missed triggers.

---

## Length-stitch ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Centralized router-level stitch | One place handles continuation for all adapters. Single implementation, satisfies SWM-05 uniformly across the 2D ladder, less code, consistent verdict shape. | ✓ |
| Per-adapter stitch logic | Each adapter handles its own continuation. More code, inconsistent verdicts, adapter-specific knowledge needed. Satisfies SWM-05 but with duplication. | |
| You decide | Agent picks the stitch ownership. | |

**User's choice:** Centralized router-level stitch
**Notes:** Recommended per the user's efficiency+requirements rule — single implementation, satisfies SWM-05 uniformly, less code, consistent verdict shape.

---

## Cerebras disable enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Omitted from bucket list | Cerebras simply not in the Tier1/Tier2 bucket rotation; re-enabled only by code change + redeploy. Zero runtime overhead, satisfies success criterion #3 (zero Cerebras traffic) by default. | ✓ |
| Hard router block | Code-level block that prevents Cerebras traffic regardless of config. Strongest guarantee against accidental re-enablement; tiny runtime check overhead. | |
| Env-gated config flag | Controlled by env var; could be flipped at deploy time. Does not guarantee zero traffic. Weakest enforcement of criterion #3. | |
| You decide | Agent picks the enforcement approach. | |

**User's choice:** Omitted from bucket list
**Notes:** Recommended per the user's efficiency+requirements rule — zero runtime overhead, satisfies success criterion #3 by default; re-enabled only by code change + redeploy.

---

## the agent's Discretion

None — the user selected a concrete option for every area discussed.

## Deferred Ideas

None — discussion stayed within phase scope.
