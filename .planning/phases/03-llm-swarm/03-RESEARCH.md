# Phase 3: LLM Swarm - Research

**Researched:** 2026-10-15
**Status:** Ready for planning

## Scope anchor (from CONTEXT.md / ROADMAP §Phase 3)

Phase 3 delivers the LLM gateway router with 2D per-model buckets: baton-pass (429/413 → 60s cool-down → next bucket, zero re-scrape), length-stitch (continuation prompt → one complete JSON verdict), per-bucket telemetry (READY / ACTIVE / 60s-COOLDOWN / DAILY-CAP) visible to the operator, Cerebras disabled by default, and Tier2 overflow engaging only after Tier1 buckets exhaust. Greenfield — no gateway code exists yet; builds on Phase 1/2 contracts (db-hot schemas, db-cold client, scheduler registry, env gate).

New capabilities (adding Cerebras routing, new providers beyond the locked ladder, dashboard telemetry UI) belong in later phases, not Phase 3.

## Provider free-tier landscape (verified 2026-10-15)

### Tier 1 — permanent free tiers (no credit card)

#### Groq (groq-sdk, first-party SDK)

Free tier: no credit card, org-level limits shared across all models and all API keys.

| Model ID | RPM | TPM | RPD | Notes |
|----------|-----|-----|-----|-------|
| `llama-3.1-8b-instant` | 30 | 6,000 | 14,400 | Cheapest/fastest; default primary bucket |
| `llama-3.3-70b-versatile` | 30 | 12,000 | 1,000 | Larger reasoning fallback |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 30 | 30,000 | 1,000 | Long context |
| `moonshotai/kimi-k2-instruct` | 60 | 10,000 | 1,000 | MoE reasoning |
| `qwen/qwen3-32b` | 60 | 6,000 | 1,000 | Coding/analysis |
| `openai/gpt-oss-120b` | 30 | 8,000 | 1,000 | Open-weight reasoning |
| `openai/gpt-oss-20b` | 30 | 8,000 | 1,000 | Smaller reasoning |

- 429 → `Groq.RateLimitError` + `Retry-After` header (seconds). Parse the header for an accurate cool-down.
- 413 → length violation (context exceeded); treat as shrink-or-stitch, never blind-retry.
- Auth: `GROQ_API_KEY`. Base URL: `https://api.groq.com/openai/v1` (OpenAI-compatible).
- Cached tokens do not count toward rate limits.
- Confidence: HIGH (Context7-verified `groq-sdk` `RateLimitError` + `Retry-After`; docs confirmed)

#### GitHub Models (openai-compat client)

Free for all GitHub accounts, no credit card. Base URL: `https://models.inference.ai.azure.com`.

| Model ID | RPM | RPD | per-request limits |
|----------|-----|-----|--------------------|
| `openai/gpt-4.1-mini` | 15 | 150 | 8K in / 4K out |
| `openai/gpt-4.1` | 10 | 50 | 8K in / 4K out |
| `openai/gpt-4o-mini` | 15 | 50 | 8K in / 4K out |
| `openai/o4-mini` | 2 | 50 | 8K in / 4K out |
| `meta/llama-4-maverick-17b-128e-instruct-fp8` | 10 | 50 | 8K in / 4K out |

- Auth: `GITHUB_TOKEN` (classic PAT, `models:read` scope).
- OpenAI SDK-compatible via `baseURL` override.
- Confidence: MEDIUM-HIGH (rate limits depend on Copilot tier; values are the free-tier baseline)

#### SambaNova (openai-compat client)

Free tier applies when no payment method is linked.

| Model ID | RPM | RPD | TPD |
|----------|-----|-----|-----|
| `DeepSeek-V3.1` | 20 | 20 | 200,000 |
| `Meta-Llama-3.3-70B-Instruct` | 20 | 20 | 200,000 |
| `gpt-oss-120b` | 20 | 20 | 200,000 |

- Base URL: `https://api.sambanova.ai/v1`.
- Auth: `SAMBANOVA_API_KEY`.
- Developer tier: $5 credit (card required, expires in 3 months) — treated as paid overflow, not relied on.
- Confidence: MEDIUM (docs.sambanova.ai rate-limits page)

### Cerebras — explicitly NOT free (locked decision D-04)

- Always-free tier ended Jul 2026; $5 30-day trial requires a verified payment method.
- Omitted from the Tier1/Tier2 bucket rotation; re-enabled only by code change + redeploy.
- Zero autonomous traffic reaches Cerebras by default (success criterion #3).

### Tier 2 overflow (per PROJECT.md 2D ladder)

Engages only after Tier1 buckets exhaust (SWM-06).

| Provider | Free basis | Notes |
|----------|------------|-------|
| Mistral | Free API keys; limits unpublished (check Limits page post-signup) | OpenAI-compatible-ish |
| Z.ai | GLM family | `z-ai/glm-5.2:free` via OpenRouter (32K ctx) |
| NVIDIA NIM | ~1,000/day | Nemotron models; `nvidia/nemotron-3.5-lightning:free` (1M ctx), `nvidia/nemotron-3-super-120b-a12b:free` (262K ctx) |
| Cohere | Free tier available | — |
| OpenRouter `:free` | 20 RPM / 50-1,000 RPD (50/day unless $10+ purchased) | 28+ free models; model IDs end in `:free` |

## Error semantics (D-02, SWM-04 / SWM-05)

| Signal | Meaning | Router response |
|--------|---------|-----------------|
| 429 / `RateLimitError` | Rate limit wall | Cool that bucket 60s (or `Retry-After` seconds), hand step_1+step_2 outputs to next bucket, zero re-scrape |
| 413 | Length cutoff | Shrink prompt / stitch via continuation, never blind-retry |
| `finish_reason:length` | Stream truncated mid-JSON | Centralized router-level stitch issues continuation prompt → one complete JSON verdict (D-03) |

## Data contracts reused (Phase 1/2)

- `packages/db-hot/src/schema.ts` — `agent_telemetry` (status incl. `cooldown`, TelemetryStatus), `task_scratchpad` (`step_position` STEP_1..STEP_4, `partial_buffer`), `PIPELINES`, `OPPORTUNITY_STATUSES`, `HOT_COLLECTIONS`
- `packages/db-cold/src/client.ts` — Turso remote `createClient({url, authToken})`, `StatementExecutor`, `INSERT OR IGNORE` tombstones
- `packages/dedup/src/fingerprint.ts` — `normalizeUrl`, `hashUrl`, `fingerprint()`
- `packages/config/src/env.ts` — fail-fast zod `EnvSchema`; LLM provider keys (`GROQ_API_KEY`, `GITHUB_TOKEN`, `SAMBANOVA_API_KEY`) must be added here before any gateway client constructs
- `packages/scheduler/src/registry.ts` — single cron registry; `noOverlap` + `maxRandomDelay` jitter + boot guards (kelektiv/node-cron@^4 only); bucket cool-down timers route through this registry, never scattered `setInterval`
- `apps/bot/src/index.ts` — boot-order pattern (parseEnv → createLogger → main, fail-fast env first)

## Implications for Phase 3 design

- Provider ladder (IDs + free status + limits) lives in **config, not code** — rotates quarterly; re-verify at build time (research flag).
- `groq-sdk` first-party for Tier 1 (`RateLimitError` + `Retry-After` error types — D-02).
- `openai` compat client with `baseURL` override for GitHub Models / SambaNova / Tier 2.
- Per-(provider×model) 2D buckets with independent cooldown counters + daily-cap bulkheads.
- `task_scratchpad.partial_buffer` carries partial LLM output across baton-passes (SWM-04/05).
- `agent_telemetry` (cooldown status) streams to dashboard SSE — operator sees per-bucket state (MEM-02, success criterion #4).
- `packages/llm/` is a new package — the `LlmRouter` + `complete()` facade. No gateway code exists yet.

## Sources

- Groq rate limits + models: console.groq.com/docs/rate-limits, console.groq.com/docs/models (free tier: 30 RPM / 6,000 TPM / 14,400 RPD, no card)
- GitHub Models: models.inference.ai.azure.com, free for all GitHub accounts (10-15 RPM / 50-150 RPD, 8K in/4K out)
- SambaNova rate limits: docs.sambanova.ai/docs/en/models/rate-limits (free: 20 RPM / 20 RPD / 200K TPD when no payment method)
- Cerebras pricing: free tier ended Jul 2026, $5 card-required 30-day trial → disabled by default
- OpenRouter `:free`: 20 RPM / 50-1,000 RPD, 28+ free models (klymentiev.com, openrouter.ai/collections/free-models)
- NVIDIA NIM / Z.ai / Cohere / Mistral: free-tier availability per PROJECT.md ladder + provider docs
- PROJECT.md / AGENTS.md stack + constraints (zero-cost, Oracle ARM, 2.5GB cache buffer, 2–3 tabs)

---
*Phase: 03-llm-swarm*
*Research completed: 2026-10-15*
