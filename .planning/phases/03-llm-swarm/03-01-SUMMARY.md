---
phase: 03-llm-swarm
plan: 01
subsystem: llm-gateway
tags: [llm, gateway, router, groq, github-models, bucket, telemetry, stitch, baton-pass]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: db-hot schemas (agent_telemetry, task_scratchpad), config env gate, scheduler registry, logger
  - phase: 02
    provides: db-hot client, task_scratchpad writer, PocketBase client
provides:
  - @zod/llm package with LlmRouter.complete() facade
  - BucketRegistry with per-(provider×model) cooldown + daily-cap bulkheads
  - GroqAdapter (groq-sdk, RateLimitError + Retry-After parsing)
  - GitHubModelsAdapter (openai-compat, baseURL https://models.inference.ai.azure.com)
  - Stitcher (centralized length-stitch continuation prompt, D-03)
  - writeBucketState telemetry writer to agent_telemetry (D-01)
  - GROQ_API_KEY, GITHUB_TOKEN, SAMBANOVA_API_KEY env keys + pino REDACT_PATHS
affects:
  - 03-02 (next plan in LLM Swarm phase)
  - Dashboard SSE telemetry consumer (MEM-02)

actuals:
  tokens: 16000
  tasks: 1
  commits: 1

tech-stack:
  added:
    - groq-sdk@^1.6.0
    - openai@^4.104.0
  patterns:
    - 2D per-(provider×model) bucket registry with cooldown + daily-cap bulkheads
    - 429/Retry-After baton-pass with zero re-scrape (SWM-04)
    - Centralized length-stitch via continuation prompt (SWM-05, D-03)
    - Vendor SDK error-type detection (D-02): Groq.RateLimitError + openai RateLimitError
    - Per-bucket telemetry persistence to agent_telemetry (D-01)
    - Cerebras omitted from bucket rotation (D-04, SWM-06)

key-files:
  created:
    - packages/llm/src/router.ts - LlmRouter.complete() facade with baton-pass + length-stitch
    - packages/llm/src/bucket.ts - BucketRegistry with per-(provider×model) 2D buckets
    - packages/llm/src/adapters/groq.ts - Groq adapter with RateLimitError + Retry-After detection
    - packages/llm/src/adapters/github.ts - GitHub Models adapter (openai-compat client)
    - packages/llm/src/stitch.ts - Centralized length-stitch continuation prompt
    - packages/llm/src/telemetry.ts - writeBucketState to agent_telemetry (READY/COOLDOWN/done)
    - packages/llm/src/index.ts - Package exports (LlmRouter, complete, BucketState, writeBucketState)
    - packages/llm/src/router.test.ts - Unit tests for router baton-pass + stitch
    - packages/llm/src/bucket.test.ts - Unit tests for bucket state machine
    - packages/llm/src/chaos.test.ts - Chaos tests for forced 429 / 413 / finish_reason:length
  modified:
    - packages/config/src/env.ts - GROQ_API_KEY, GITHUB_TOKEN (required), SAMBANOVA_API_KEY (optional) in EnvSchema
    - packages/logger/src/index.ts - GROQ_API_KEY, GITHUB_TOKEN, SAMBANOVA_API_KEY added to REDACT_PATHS
    - packages/config/src/env.test.ts - Added GROQ_API_KEY, GITHUB_TOKEN to REQUIRED fixture
    - packages/config/vitest.config.ts - Added GROQ_API_KEY, GITHUB_TOKEN to test env
    - packages/logger/vitest.config.ts - Added GROQ_API_KEY, GITHUB_TOKEN to test env
    - packages/sanitize/vitest.config.ts - Added GROQ_API_KEY, GITHUB_TOKEN to test env
    - packages/scheduler/vitest.config.ts - Added GROQ_API_KEY, GITHUB_TOKEN to test env
    - pnpm-lock.yaml - Added groq-sdk, openai dependencies

key-decisions:
  - "D-01: per-bucket state persists in agent_telemetry via PocketBase (confirmed by checkpoint:decision)"
  - "D-02: 429/413 detection via vendor SDK error types (confirmed by checkpoint:decision)"
  - "D-04: Cerebras omitted from tracer bucket rotation (locked decision, zero autonomous traffic)"

requirements-completed: [SWM-04, SWM-05, SWM-06]

coverage:
  - id: D1
    description: LlmRouter.complete() end-to-end audit: Groq → forced 429 → 60s cooldown → GitHub Models fallback → complete JSON verdict, zero re-scrape
    requirement: SWM-04
    verification:
      - kind: unit
        ref: packages/llm/src/router.test.ts#LlmRouter.complete > forced 429 on Groq
        status: pass
      - kind: unit
        ref: packages/llm/src/chaos.test.ts#chaos: forced 429 baton-pass
        status: pass
    human_judgment: false
  - id: D2
    description: finish_reason:length truncation stitched via one continuation prompt into complete JSON verdict
    requirement: SWM-05
    verification:
      - kind: unit
        ref: packages/llm/src/router.test.ts#LlmRouter.complete > finish_reason:length triggers stitch
        status: pass
      - kind: unit
        ref: packages/llm/src/chaos.test.ts#chaos: finish_reason:length stitch
        status: pass
    human_judgment: false
  - id: D3
    description: Cerebras absent from bucket rotation; no autonomous Cerebras traffic reaches it
    requirement: SWM-06
    verification:
      - kind: unit
        ref: packages/llm/src/bucket.test.ts#Cerebras is absent from the default ladder
        status: pass
      - kind: unit
        ref: packages/llm/src/router.test.ts#LlmRouter.complete > Cerebras is absent from the tracer ladder
        status: pass
    human_judgment: false
  - id: D4
    description: Per-bucket state (READY → 60s-COOLDOWN → done) written to agent_telemetry for operator visibility
    requirement: SWM-04 (success criterion #4)
    verification:
      - kind: unit
        ref: packages/llm/src/router.test.ts#LlmRouter.complete > returns verdict from first bucket on success, writes telemetry
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-10-15
status: complete
---

# Phase 03 Plan 01: LLM Swarm Tracer Slice Summary

**LlmRouter gateway tracer: Groq primary → forced 429 baton-pass → GitHub Models fallback + length-stitch, with per-bucket telemetry and Cerebras disabled by default.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-15T23:00:00Z
- **Completed:** 2026-10-15T23:18:00Z
- **Tasks:** 1 completed (Task 2 tracer; Task 1 checkpoint:decision pre-confirmed)
- **Files modified:** 21

## Accomplishments

- @zod/llm package created with LlmRouter.complete() facade, BucketRegistry, GroqAdapter, GitHubModelsAdapter, Stitcher, writeBucketState
- Forced 429 on Groq triggers 60s bucket cooldown, hands step1+step2 to GitHub Models fallback with zero source re-scrape (SWM-04)
- finish_reason:length truncation stitched via one continuation prompt into complete JSON verdict (SWM-05)
- Cerebras absent from bucket rotation; no autonomous Cerebras traffic (SWM-06, D-04)
- Per-bucket state transitions (READY → 60s-COOLDOWN → done) written to agent_telemetry (D-01)
- Vendor SDK error-type detection: Groq.RateLimitError + openai RateLimitError with Retry-After parsing (D-02)
- LLM provider keys redacted in logs via pino REDACT_PATHS (T-03-01)
- All 22 unit + chaos tests green; @zod/llm compiles with tsc; full workspace build passes (128 tests)

## Task Commits

Each task was committed atomically:

1. **Task 2: End-to-end gateway tracer** - `f88a768` (feat)

## Files Created/Modified

- `packages/llm/src/router.ts` - LlmRouter.complete() facade with baton-pass + length-stitch
- `packages/llm/src/bucket.ts` - BucketRegistry with per-(provider×model) 2D buckets
- `packages/llm/src/adapters/groq.ts` - Groq adapter with RateLimitError detection
- `packages/llm/src/adapters/github.ts` - GitHub Models adapter (openai-compat)
- `packages/llm/src/stitch.ts` - Centralized length-stitch continuation prompt
- `packages/llm/src/telemetry.ts` - writeBucketState to agent_telemetry
- `packages/llm/src/index.ts` - Package exports
- `packages/llm/src/router.test.ts` - Router unit tests (7 tests)
- `packages/llm/src/bucket.test.ts` - Bucket unit tests (9 tests)
- `packages/llm/src/chaos.test.ts` - Chaos tests for forced 429/413/length (6 tests)
- `packages/config/src/env.ts` - GROQ_API_KEY, GITHUB_TOKEN, SAMBANOVA_API_KEY in EnvSchema
- `packages/logger/src/index.ts` - LLM provider keys added to REDACT_PATHS

## Decisions Made

- D-01 (confirmed): Per-bucket state persists in agent_telemetry via PocketBase — satisfies operator visibility and restart survival
- D-02 (confirmed): 429/413 detection via vendor SDK error types — precise detection with Retry-After parsing
- D-04 (locked): Cerebras omitted from tracer bucket rotation — zero autonomous traffic by default

## Deviations from Plan

None - plan executed exactly as written. Minor implementation adjustments:

- groq-sdk version adjusted from ^1.33.0 to ^1.6.0 (latest available on npm registry)
- Telemetry sink uses structural PbLike interface instead of PocketBase type import (pnpm workspace isolation)
- Router accepts TelemetrySink instead of PocketBase directly for decoupling and testability

## Issues Encountered

- groq-sdk latest version is 1.6.0 (not 1.33.0 as initially specified) — resolved by using latest available version
- pino logger level argument fix: createLogger('llm/router') treated 'llm/router' as a level name; changed to createLogger('info').child({ component: 'llm/router' })
- PocketBase type not directly importable from @zod/llm due to pnpm workspace isolation — resolved with structural PbLike interface
- Config/logger/sanitize/scheduler vitest configs needed GROQ_API_KEY and GITHUB_TOKEN added to test env since env singleton is parsed at module load

## User Setup Required

External services require manual configuration per 03-01-PLAN.md user_setup:
- GROQ_API_KEY: https://console.groq.com/keys → copy key
- GITHUB_TOKEN: GitHub → Settings → Developer settings → Personal access tokens → models:read

## Next Phase Readiness

Tracer slice complete. The LlmRouter gateway contract is proven on the Groq + GitHub Models provider pair. Next phase (03-02) can extend the ladder with SambaNova and Tier 2 overflow providers.

---
*Phase: 03-llm-swarm*
*Completed: 2026-10-15*
