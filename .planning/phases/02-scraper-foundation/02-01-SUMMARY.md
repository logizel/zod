---
phase: 02-scraper-foundation
plan: 01
subsystem: scraper
tags: [jina, playwright, pocketbase, scout, sanitize, browser]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: config env gate, logger redaction, db-hot client/schema, dedup fingerprint/hash helpers
provides:
  - JINA_API_KEY required boot gate + redacted secret (D-06)
  - Scout prefilter (expiry + spam, zero fetch) per D-17/D-18/D-19
  - db-hot TaskScratchpad STEP_1->STEP_2 persistence + tombstone at 5 attempts (D-20..D-23)
  - sanitize package: Jina fetch (30s cap), cheerio+turndown (8k cap), fetch facade SSRF guard + browser fallback (D-01..D-07)
  - browser package: shared Chromium, p-limit(2) FIFO queue, fresh context, close-in-finally (D-08..D-15)
affects: [scraper pipelines, audit flow, phase 03 expansion]

# Actuals
actuals:
  tokens: 8300
  tasks: 1
  commits: 2
  plan_head_before: dfa30d40798912eee7a3109c65db06c8a7ab9dfb
  plan_head_after: 391bbd57053b880db798a9464aabe8481f7f6fd1

tech-stack:
  added:
    - date-fns@4.4.0
    - date-fns-tz@3.2.0
    - cheerio@1.2.0
    - turndown@7.2.4
    - playwright-core@1.64.1
    - p-limit@7.3.3
  patterns:
    - Jina-first fetch with browser fallback
    - Pure-function scout gate before any network
    - PocketBase scratchpad resume-by-URL (STEP_1->STEP_2 only)
    - Shared browser singleton + p-limit(2) queue

key-files:
  created:
    - packages/scout/src/index.ts
    - packages/scout/src/expiry.ts
    - packages/scout/src/spam.ts
    - packages/db-hot/src/scratchpad.ts
    - packages/sanitize/src/jina.ts
    - packages/sanitize/src/strip.ts
    - packages/sanitize/src/fetch.ts
    - packages/browser/src/queue.ts
  modified:
    - packages/config/src/env.ts
    - packages/logger/src/index.ts
    - packages/db-hot/package.json
    - packages/db-hot/tsconfig.json
    - tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "D-01 Jina-first strict confirmed; D-08 max 2 concurrent tabs; D-20 STEP_1->STEP_2 only"
  - "JINA_API_KEY required at boot and redacted via REDACT_PATHS"

patterns-established:
  - "Scout is a pure prefilter; zero fetch/I/O before STEP_1 scratchpad"
  - "Browser tab cleanup in finally; p-limit caps concurrency at 2"

requirements-completed: [ING-06, SWM-01, SWM-03]

status: complete

coverage:
  - id: D1
    description: "Candidate URL passes Scout and reaches STEP_2 with capped markdown"
    requirement: "ING-06"
    verification:
      - kind: unit
        ref: "packages/scout/src/scout.test.ts"
        status: pass
      - kind: unit
        ref: "packages/sanitize/src/sanitize.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "JINA_API_KEY required and redacted"
    requirement: "ING-06"
    verification:
      - kind: unit
        ref: "packages/config/src/env.test.ts"
        status: pass
    human_judgment: false

# Metrics
duration: tracer
completed: 2026-10-15
---

# Phase 2 Plan 01: Tracer Summary

**End-to-end Jina-first fetch-and-filter slice: one candidate URL flows Scout -> STEP_1 -> Jina fetch -> sanitize (<=8k) -> STEP_2, with browser fallback wired and all six packages compiling.**

## Performance

- **Duration:** tracer slice
- **Started/Completed:** 2026-10-15
- **Tasks:** 1
- **Files modified:** 36 (1253 insertions)

## Accomplishments

- Added required `JINA_API_KEY` to EnvSchema and redacted it in all logs
- Implemented `@zod/scout` with expiry (strict isPast, D-16) and spam blocklist (D-17)
- Implemented db-hot `task_scratchpad` store: getOrCreate/advanceToStep2/recordFailure + tombstone at 5
- Implemented `@zod/sanitize` Jina-first facade with SSRF guard and 8k markdown cap
- Implemented `@zod/browser` shared Chromium with p-limit(2) queue and close-in-finally
- All packages build via `pnpm build`; 67 vitest tests pass

## Deviations from Plan

None — plan executed as written.

## Self-Check: PASSED
