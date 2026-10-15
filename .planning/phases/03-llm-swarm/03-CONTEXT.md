# Phase 3: LLM Swarm - Context

**Gathered:** 2026-10-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers the LLM gateway router with 2D per-model buckets: baton-pass (429/413 → 60s cool-down → next bucket, zero re-scrape), length-stitch (continuation prompt → one complete JSON verdict), per-bucket telemetry (READY / ACTIVE / 60s-COOLDOWN / DAILY-CAP) visible to the operator, Cerebras disabled by default, and Tier2 overflow engaging only after Tier1 buckets exhaust. Scope anchor: auditors get reliable model answers despite free-tier quota walls — failures hand off, never re-scrape. Greenfield — no gateway code exists yet; builds on Phase 1/2 contracts (db-hot schemas, db-cold client, scheduler registry, env gate).

New capabilities (e.g., adding Cerebras routing, new LLM providers beyond the locked ladder, dashboard telemetry UI) belong in later phases, not Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Bucket state persistence & restart survival
- **D-01:** Per-bucket state (READY / 60s-COOLDOWN / DAILY-CAP) lives in `agent_telemetry` via PocketBase, streamed to the dashboard over SSE (MEM-02). — **Reversibility:** costly — undo requires re-writing gateway telemetry persistence and the dashboard SSE consumer. Rationale: satisfies success criterion #4 (operator sees per-bucket state from gateway telemetry) and survives Oracle ARM idle reclaim/restart; in-memory was rejected because it loses state on restart and fails the visibility requirement.

### 429/413 detection mechanism
- **D-02:** Gateway detects 429/413 via vendor SDK error types (e.g., groq-sdk `RateLimitError` + `Retry-After` header), one code path per vendor adapter. — **Reversibility:** costly — undo re-writes detection logic in every adapter across the 2D ladder. Rationale: precise detection (fewer false cooldowns), respects `Retry-After` for an accurate 60s cool-down, satisfies SWM-04 exactly with zero re-scraping. Generic HTTP status inspection was rejected as less precise — risks false/missed triggers and no `Retry-After` parsing.

### Length-stitch ownership
- **D-03:** On `finish_reason:length`, a centralized router-level stitch issues the continuation prompt to produce one complete JSON verdict. — **Reversibility:** reversible — contained within the gateway package; satisfies SWM-05 uniformly across the 2D ladder with a single implementation and consistent verdict shape. `task_scratchpad.partial_buffer` (Phase 2 contract) carries the partial stream across baton-passes.

### Cerebras disable enforcement
- **D-04:** Cerebras is omitted from the Tier1/Tier2 bucket rotation; re-enabled only by code change + redeploy. — **Reversibility:** reversible — adding Cerebras back is a bucket-list change, no migration or contract break. Zero runtime overhead; satisfies success criterion #3 (no autonomous traffic reaches Cerebras) by default. Hard router block and env-gated flag were considered but rejected — the block adds runtime overhead for a guarantee already met by omission; an env flag could be flipped at deploy time and doesn't guarantee zero traffic.

### the agent's Discretion
None — the user selected a concrete option for every area discussed.

### Folded Todos
None — no todos matched Phase 3 in `cross_reference_todos`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase goal & requirements
- `.planning/ROADMAP.md` §Phase 3 — phase goal ("failures hand off, never re-scrape"), requirements SWM-04/05/06, success criteria 1–4
- `.planning/PROJECT.md` — 2D LLM ladder model list (Tier1: Groq / GitHub Models / SambaNova; Tier2: Mistral / Z.ai / NIM / Cohere / OpenRouter :free; Cerebras disabled by default), Key Decisions table ("2D per-model bucket rotation + scratchpad handoff")
- `.planning/REQUIREMENTS.md` §Swarm — SWM-04 (429/413/timeout cool-down + baton-pass, zero re-scrape), SWM-05 (finish_reason:length stitched via continuation prompt), SWM-06 (2D bucket rotation; Cerebras disabled by default)

### Data contracts (Phase 1/2, reused by Phase 3)
- `packages/db-hot/src/schema.ts` — `agent_telemetry` (TELEMETRY_STATUSES incl. `cooldown`), `task_scratchpad` (`step_position` STEP_1..STEP_4, `partial_buffer`), `HOT_COLLECTIONS`, `INDEX_NOTES`
- `packages/db-cold/src/client.ts` — Turso remote `createClient({url, authToken})`, `StatementExecutor`, INSERT OR IGNORE tombstones

### Configuration & scheduler
- `packages/config/src/env.ts` — fail-fast zod env gate; LLM provider API keys (GROQ_API_KEY, GITHUB_TOKEN, SAMBANOVA_API_KEY, etc.) must be added here before any gateway client constructs
- `packages/scheduler/src/registry.ts` — single cron registry owning all `schedule()` calls; `noOverlap` + `maxRandomDelay` jitter + boot guards (kelektiv/node-cron@^4 only)

### Runtime/stack
- AGENTS.md (project root) — Technology Stack and Constraints sections (zero-cost, Oracle ARM, 2.5GB cache buffer, 2–3 tabs, poll cadences)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/db-hot/src/schema.ts` — `agent_telemetry` collection (status incl. `cooldown`) for persisting bucket state + SSE visibility to the dashboard; `task_scratchpad` (`step_position`, `partial_buffer`) for baton-pass handoff and length-stitch buffering across 429/413
- `packages/db-cold/src/client.ts` — Turso remote-client pattern (`createClient`, `StatementExecutor`, INSERT OR IGNORE) to mirror if cold-ledger bucket state is ever needed
- `packages/scheduler/src/registry.ts` — single cron registry with `noOverlap` + jitter + boot guards; gateway bucket cool-down timers must route through this registry, never scatter `setInterval`
- `packages/config/src/env.ts` — fail-fast zod env gate (parseEnv → validate → boot); add LLM provider keys here
- `apps/bot/src/index.ts` — boot-order pattern (parseEnv → createLogger → main, fail-fast env first) that the gateway entrypoint should follow

### Established Patterns
- fail-fast env parse first, then logger, then `main` (D-06/D-07)
- zod `Schema.parse()` boundaries, loud on mismatch (db-hot parsing policy)
- single scheduler registry — never scatter `setInterval` or ad-hoc schedules (D-23)
- Turso remote-only `createClient`, INSERT OR IGNORE tombstones never overwritten (D-11)

### Integration Points
- Gateway router reads/writes bucket state via `agent_telemetry` over PocketBase SSE (MEM-02)
- `task_scratchpad.partial_buffer` carries partial LLM output across baton-passes (SWM-04/05)
- Env gate must parse LLM provider keys before any gateway client constructs
- No new cron schedules — bucket cool-down timers must not bypass the single scheduler registry

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the locked 2D ladder and Phase 1/2 contracts.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-llm-swarm*
*Context gathered: 2026-10-15*
