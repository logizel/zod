---
phase: 03-llm-swarm
plan: 02
subsystem: llm-gateway
tags: [llm, gateway, ladder, tier1, tier2, overflow, priority, circuit-breaker, chaos, adapters, swarm]

# Dependency graph
requires:
  - phase: 03-llm-swarm
    plan: 01
    provides: @zod/llm tracer slice (LlmRouter.complete, BucketRegistry, GroqAdapter, GitHubModelsAdapter, Stitcher, telemetry), Cerebras-disabled baseline
  - phase: 01-foundation
    provides: db-hot schemas (agent_telemetry, task_scratchpad), config env gate, scheduler registry, logger
provides:
  - @zod/llm full 2D ladder (LadderConfig: Tier1 ×6 + Tier2 overflow)
  - BucketRegistry daily-cap bulkheads (UTC-midnight reset), allTier1Available() Tier2 gate
  - PriorityQueue Curator(1) > Auditor(2) > Scout(3), per-lane + global in-flight caps
  - SpendCircuitBreaker default-deny paid traffic, zero-cost budget, UTC-midnight auto-resume
  - 5 provider adapters: SambaNova, Mistral, OpenRouter (:free), Z.ai (GLM), NVIDIA NIM (Nemotron)
  - Router Tier1→Tier2 baton-pass, length-stitch, tier-prefixed path audit trail, UNVERIFIED on exhaustion
  - Chaos suite: per-model 429/413/finish_reason:length across all ladder models
affects:
  - 03-03 (next plan in LLM Swarm phase)
  - Dashboard SSE telemetry consumer (MEM-02) via agent_telemetry bucket-state writes
  - Scout/Auditor/Curator pipelines (shared-pool contention prevention)

# Dependency graph end

tech-stack:
  added:
    - openai@^4.85.0 (already present; used by all Tier2/openai-compat adapters)
    - zod@^4.6.7 (already present)
  patterns:
    - 2D per-(provider×model) bucket table: Tier1 → Tier2 overflow, Tier2 only when all Tier1 unavailable
    - Tier1: Groq (llama-3.1-8b-instant, llama-3.3-70b-versatile, meta-llama/llama-4-scout-17b-16e-instruct), GitHub Models (gpt-4.1-mini, gpt-4.1), SambaNova (Meta-Llama-3.3-70B-Instruct, opt-in)
    - Tier2: Mistral, Z.ai (glm-5.2), NVIDIA NIM (nemotron-3.5-lightning), Cohere (via OpenRouter :free), OpenRouter :free
    - Cerebras absent from Tier1 and Tier2 (D-04, SWM-06); ladder lint test asserts no Cerebras
    - Daily-cap bulkheads: dailyCapRemaining/dailyCapResetAt, time-driven UTC-midnight reset, never caller-blocked
    - Zero-cost spend circuit-breaker: default-deny paid-opt-in, parks at budget breach, auto-resumes at UTC midnight
    - Priority lanes Curator > Auditor > Scout with per-lane + global in-flight caps (no setInterval — single scheduler registry rule)
    - Router path records every bucket+tier attempted; UNVERIFIED + reason on total exhaustion, never crashes, never Cerebras

key-files:
  created:
    - packages/llm/src/ladder.ts - LadderConfig, Tier1/Tier2 bucket tables, Cerebras-absent assertion, capability flags
    - packages/llm/src/priority.ts - PriorityQueue, Curator/Auditor/Scout lanes, per-lane + global caps
    - packages/llm/src/circuit-breaker.ts - SpendCircuitBreaker, evaluate() → PARK/ALLOW, UTC-midnight auto-resume
    - packages/llm/src/adapters/sambanova.ts - SambaNova adapter (api.sambanova.ai/v1), paid-opt-in
    - packages/llm/src/adapters/mistral.ts - Mistral adapter (openai-compat-ish)
    - packages/llm/src/adapters/openrouter.ts - OpenRouter adapter (:free model IDs)
    - packages/llm/src/adapters/zimai.ts - Z.ai adapter (GLM family, glm-5.2)
    - packages/llm/src/adapters/nvidia.ts - NVIDIA NIM adapter (Nemotron family)
  modified:
    - packages/llm/src/router.ts - Tier1→Tier2 routing, circuit-breaker + priority-queue integration, UNVERIFIED on exhaustion
    - packages/llm/src/bucket.ts - dailyCapRemaining/dailyCapResetAt/isDailyCapped/dailyCapExhausted, allTier1Available(), per-tier splits
    - packages/llm/src/router.test.ts - tier-prefixed paths, Tier1/Tier2 gate, circuit-breaker default-deny, priority caps, full-ladder fallback matrix
    - packages/llm/src/bucket.test.ts - daily-cap bulkheads, tier tracking, allTier1Available() gate
    - packages/llm/src/chaos.test.ts - per-model 429/413/length chaos tests across all ladder models

# actuals (measured; chars/4 over realized diff, same scale as plan estimate)
actuals:
  tokens: 19536
  tasks: 2
  commits: 2
  plan_head_before: 44797ac4f3fb163f21deb3c6fd0839e7f001a5a7
  plan_head_after: 50baf97b4508a3a453bdd9ad87ed98d913dc91ed

decisions:
  - "Kept SambaNova out of Tier1 by default; wired only when SAMBANOVA_API_KEY is set (zero-cost constraint, D-04 pattern)"
  - "Cohere reached via OpenRouter :free pool rather than a dedicated adapter (no separate cohere.ts)"
  - "Circuit-breaker defaults to zero-cost budget (0); paid traffic requires explicit operator opt-in"
  - "Total ladder exhaustion returns UNVERIFIED + reason rather than throwing (chaos requirement)"
  - "PriorityQueue is count-based (no setInterval) to satisfy the single scheduler registry rule (D-23)"

metrics:
  duration: ~45 min
  completed: 2026-10-15
  status: complete

---

# Phase 03 Plan 02: Full 2D LLM Swarm Ladder Summary

**Full 2D LLM ladder: Tier1 (Groq×3, GitHub Models×2, SambaNova×1 opt-in) → Tier2 overflow (Mistral, Z.ai, NVIDIA NIM, Cohere, OpenRouter :free) engaging only after Tier1 exhausts, with Curator>Auditor>Scout priority lanes, daily-cap bulkheads, a zero-cost spend circuit-breaker, and per-model 429/413/length chaos coverage. Cerebras absent from both tiers.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-10-15
- **Tasks:** 2 completed
- **Files modified:** 13 (8 created, 5 modified)

## Accomplishments

- `@zod/llm` gateway expanded from the Wave-1 tracer (Groq → GitHub Models) to the full 2D ladder (SWM-04/05/06).
- Tier1 rotates 6 buckets with independent cooldown + daily-cap counters (SWM-06).
- Tier2 overflow engages ONLY when ALL Tier1 buckets are COOLDOWN/DAILY-CAP (tier1Available() gate); verified Tier2 is not engaged while a Tier1 bucket is READY (T-03-06).
- Cerebras absent from Tier1 and Tier2; ladder lint test (`assertNoCerebras`) fails CI if any Cerebras model ID appears (T-03-09, D-04).
- PriorityQueue routes Curator(1) > Auditor(2) > Scout; per-lane + global in-flight caps prevent shared-pool deadlock and Scout starvation (T-03-08).
- Daily-cap bulkheads park buckets at DAILY-CAP until UTC midnight; time-driven recovery, never caller-blocked, no setInterval (D-23).
- SpendCircuitBreaker default-denies paid-opt-in traffic and parks on zero-cost budget breach; auto-resumes at UTC midnight (T-03-07).
- Router `path[]` records every bucket+tier attempted for audit trail (T-03-13); total exhaustion returns UNVERIFIED + reason, never crashes, never routes to Cerebras.
- 5 provider adapters (SambaNova, Mistral, OpenRouter, Z.ai, NVIDIA NIM), each mapping 429/413 to the unified error shape; SambaNova wired only when SAMBANOVA_API_KEY set.
- Chaos suite forces 429/413/finish_reason:length for every Tier1 + Tier2 model; every case resolves via baton-pass or stitch, zero re-scrape, no crash.
- Full-ladder fallback matrix: all Tier1 unavailable → Tier2 engaged → valid JSON verdict from last-available bucket.
- All 51 unit + chaos tests green; `@zod/llm` compiles with `tsc -b`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Full 2D ladder** - `1997a18` (feat) — ladder.ts, bucket.ts, priority.ts, circuit-breaker.ts, router.ts, 5 adapters, router.test.ts, bucket.test.ts
2. **Task 2: Chaos suite** - `50baf97` (feat) — chaos.test.ts, router.test.ts (fallback matrix)

## Deviations from Plan

None — plan executed exactly as written. Minor implementation adjustments:

- SambaNova adapter constructed only when `SAMBANOVA_API_KEY` is present; Tier2 adapters wired key-less (operator keys added separately) since env.ts (out of scope for this plan) only defines SAMBANOVA_API_KEY.
- `BucketDef.tier` added to bucket.ts (required by LadderConfig/tier routing); existing bucket tests updated accordingly.
- Router returns `UNVERIFIED` (not a throw) on total exhaustion, per Task 2 chaos acceptance criteria; existing exhaustion test updated.
- Cohere is reached via the OpenRouter `:free` pool rather than a dedicated `cohere.ts` adapter (no separate file in files_modified).

## Known Stubs

None. All runtime paths are wired; Tier2 adapters are key-less placeholders pending operator key configuration (documented deviation, intentional — zero-cost constraint means no keys are auto-provisioned).

## Threat Flags

None. All new surface (Tier2 overflow gate, circuit-breaker paid default-deny, Cerebras absence) is covered by the plan's threat model (T-03-06/07/08/09/13) and corresponding tests.

## Self-Check

- All created files exist on disk and are committed.
- All 2 commits exist on branch `agent-03-02`.
- `pnpm --filter @zod/llm build` (tsc -b) passes.
- `pnpm --filter @zod/llm test`: 51/51 tests pass across 3 test files.

## User Setup Required

- SambaNova paid overflow: `SAMBANOVA_API_KEY` from https://cloud.sambanova.ai → API keys (only if operator opts into paid overflow; NOT relied on for autonomous traffic, D-04 pattern).
- Tier2 provider keys (Mistral, Z.ai, NVIDIA NIM, OpenRouter) are not configured in this plan; adapters are wired but key-less.

---
*Phase: 03-llm-swarm*
*Completed: 2026-10-15*
