---
phase: 06-delivery-local-social-coverage
plan: 01
subsystem: ingestion
tags: [discord.js, zod, scheduler, pocketbase, crawler, social-polling, relay]

# Dependency graph
requires:
  - phase: 05-jobs-loot-pipelines
    provides: Existing CandidateSource interface, runStubTick pipeline, scheduler registry, router-service, gateway, env schema
provides:
  - Local DK/Udupi CandidateSource (domain inventory + bio-link browser poll)
  - X/LinkedIn social CandidateSource (session-cookie polling with human pacing)
  - Discord announcements relay service (polling timer into #raw-incoming-feeds)
  - Phase 6 env keys (LOCAL_WATCHLIST_DOMAINS, SOCIAL_COOKIES_PATH, DISCORD_RELAY_SOURCE_CHANNEL_ID, BOOKMARK_EMOJI_ID, DISCORD_CHANNEL_*)
  - GuildMessageReactions gateway intent
  - CHANNEL_ID_ENV_KEYS extended with 5 new bucket channels; resolveChannel exported
affects:
  - 06-02 (local/travel/TBA routing, bookmark, reminders, taste rules)
  - 06-03 (taste rule ingestion/application)
  - 06-04 (dashboard, telemetry)

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 14500
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - CandidateSource injection via scheduler registry (candidateSources in RegisterOptions)
    - resolveChannel env-ID-first + exact-name fallback for bucket channels
    - Bio-link pages via shared Playwright fetchViaBrowser singleton
    - Session-cookie social polling with 30-90s jitter + max 5 actions/tick
    - Relay cursor persistence in agent_telemetry for crash recovery

key-files:
  created:
    - packages/discord-router/src/portals/local.ts - Local DK/Udupi CandidateSource
    - packages/discord-router/src/portals/local.test.ts - Local source unit tests
    - packages/discord-router/src/portals/social.ts - X/LinkedIn social CandidateSource
    - packages/discord-router/src/portals/social.test.ts - Social source unit tests
    - packages/discord-router/src/relay.ts - Announcements relay service
    - packages/discord-router/src/relay.test.ts - Relay service unit tests
  modified:
    - packages/config/src/env.ts - Phase 6 env keys added to EnvSchema
    - packages/discord-router/src/gateway.ts - GuildMessageReactions intent added
    - packages/discord-router/src/router-service.ts - CHANNEL_ID_ENV_KEYS extended, resolveChannel exported
    - packages/scheduler/src/jobs.ts - candidateSource on local/social stubs, relay-poll in GATEWAY_JOBS
    - packages/scheduler/src/registry.ts - candidateSources forwarded through RegisterOptions to runStubTick
    - apps/scheduler/src/registry-start.ts - local/social sources + relay-poll registered
    - .env.example - Phase 6 env key placeholders (bijective with EnvSchema)

key-decisions:
  - "Hybrid domain inventory: code defaults (NITK, MIT Manipal, NMAMIT, SJEC, Sahyadri, MITE, AJIET, St. Aloysius, SOSC) + LOCAL_WATCHLIST_DOMAINS env override (D-01)"
  - "Bio-link pages use shared Playwright fetchViaBrowser singleton — no new browser instance (D-03)"
  - "Geo classification deferred to audit time (Plan 02); source passes location + organizer through (D-02)"
  - "Social polling: cookie file on disk read at tick time, 30-90s jitter, max 5 actions/tick, no search-index fallback (D-07/D-08/D-09)"
  - "Relay: polling timer (not gateway listener) to avoid cross-guild bot membership (D-04)"
  - "Relay cursor persisted in agent_telemetry (slot: relay-currency) for crash recovery"

patterns-established:
  - "CandidateSource injection: RegisterOptions.candidateSources forwarded to runStubTick via registerStubJobs"
  - "Env-ID-first channel resolution via CHANNEL_ID_ENV_KEYS, extended with 5 new bucket channels"
  - "No setInterval scatter — all cron through scheduler registry (registerGatewayJobs for relay-poll)"

requirements-completed: [ING-02, ING-04, ING-05]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: Local DK/Udupi CandidateSource produces PollCandidate[] from watchlist domains via runStubTick pipeline
    requirement: ING-02
    verification:
      - kind: unit
        ref: packages/discord-router/src/portals/local.test.ts#local source
        status: pass
    human_judgment: false
  - id: D2
    description: X/LinkedIn social CandidateSource enforces 30-90s jitter and max 5 actions per tick
    requirement: ING-05
    verification:
      - kind: unit
        ref: packages/discord-router/src/portals/social.test.ts#social source
        status: pass
    human_judgment: false
  - id: D3
    description: Discord announcements relay polls external channel and forwards to #raw-incoming-feeds with cursor persistence
    requirement: ING-04
    verification:
      - kind: unit
        ref: packages/discord-router/src/relay.test.ts#relay service
        status: pass
    human_judgment: false

# Metrics
duration: 45min
completed: 2026-10-17
status: complete
---

# Phase 06 Plan 01: Local/Social Coverage — CandidateSource Wiring Summary

**Local DK/Udupi CandidateSource, X/LinkedIn social polling with human pacing, and Discord announcements relay wired into the existing candidate pipeline, plus Phase 6 env configuration and scheduler registry extensions.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-10-17T00:00:00Z
- **Completed:** 2026-10-17T00:45:00Z
- **Tasks:** 3 completed
- **Commits:** 3

## Accomplishments

- Local DK/Udupi CandidateSource (`local.ts`) with hybrid domain inventory (code defaults + `LOCAL_WATCHLIST_DOMAINS` env override), cheerio HTML parsing, and `fetchViaBrowser` for JS-rendered bio-link pages via the shared Playwright singleton — plugs into `runStubTick` via `candidateSources` injection
- X/LinkedIn social CandidateSource (`social.ts`) reading burner session cookies from disk at tick time, enforcing 30-90s jitter between requests and max 5 actions per tick, with no search-index fallback — plugs into `runStubTick` via `candidateSources` injection
- Discord announcements relay service (`relay.ts`) polling external `#announcements` on a 15m + 5m jitter cron, forwarding new messages to `#raw-incoming-feeds`, persisting the last relayed message ID in `agent_telemetry` (slot: `relay-cursor`) for crash recovery
- Phase 6 env keys added to `EnvSchema` (9 keys) with bijective `.env.example` placeholders
- `GatewayIntentBits.GuildMessageReactions` added to gateway intents (Pitfall 1 prevention)
- `CHANNEL_ID_ENV_KEYS` extended with 5 new bucket channels; `resolveChannel` exported for cross-module use
- `local-stub` and `social-stub` jobs wired with `candidateSource`; `relay-poll` added to `GATEWAY_JOBS` and registered via `registerGatewayJobs` tickHandler
- All 156 vitest tests pass across 28 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Local DK/Udupi CandidateSource — domain inventory + bio-link browser poll (tracer)** - `c9f7735` (feat)
2. **Task 2: X/LinkedIn social polling — session-cookie CandidateSource with human pacing** - `ec97b3d` (feat)
3. **Task 3: Discord announcements relay — polling timer into #raw-incoming-feeds** - `8b4d122` (feat)

**Plan metadata commit:** `8b4d122` (Task 3 commit includes final state)

## Files Created/Modified

- `packages/discord-router/src/portals/local.ts` — Local DK/Udupi CandidateSource (new)
- `packages/discord-router/src/portals/local.test.ts` — 9 unit tests for local source (new)
- `packages/discord-router/src/portals/social.ts` — X/LinkedIn social CandidateSource (new)
- `packages/discord-router/src/portals/social.test.ts` — 10 unit tests for social source (new)
- `packages/discord-router/src/relay.ts` — Announcements relay service (new)
- `packages/discord-router/src/relay.test.ts` — 6 unit tests for relay service (new)
- `packages/config/src/env.ts` — Added 9 Phase 6 env keys to EnvSchema (modified)
- `packages/discord-router/src/gateway.ts` — Added GuildMessageReactions intent (modified)
- `packages/discord-router/src/router-service.ts` — Extended CHANNEL_ID_ENV_KEYS, exported resolveChannel (modified)
- `packages/scheduler/src/jobs.ts` — candidateSource on local/social stubs; relay-poll in GATEWAY_JOBS (modified)
- `packages/scheduler/src/registry.ts` — candidateSources forwarded through RegisterOptions to runStubTick (modified)
- `apps/scheduler/src/registry-start.ts` — Registered local/social sources + relay-poll (modified)
- `.env.example` — Phase 6 env key placeholders (modified)

## Decisions Made

- Followed the plan exactly as specified — all D-nnn decisions from 06-CONTEXT.md and 06-RESEARCH.md were implemented as documented
- RegisterOptions extended with `candidateSources` field and forwarded through `registerStubJobs` to `runStubTick` to enable candidate source injection for stub jobs
- No new scheduler jobs created — `local-stub` and `social-stub` already existed in `STUB_JOBS`; `relay-poll` added to `GATEWAY_JOBS` per plan specification

## Deviations from Plan

None - plan executed exactly as written. All implementation steps, done criteria, and verification commands were followed.

## Issues Encountered

None - all tasks completed successfully with tests passing.

## User Setup Required

Per the plan's `user_setup` frontmatter:
- **Discord bookmark emoji**: Custom bookmark emoji must be created on the Discord server before bot deployment (Server Settings → Emojis → Upload Image) — referenced by `BOOKMARK_EMOJI_ID` env key
- **X/LinkedIn cookies**: Burner session cookies must be exported from a browser session to a JSON file on the VM disk, with `SOCIAL_COOKIES_PATH` env pointing to that location

## Next Phase Readiness

All three CandidateSources are wired into the pipeline and ready for Plan 02 (local/travel/TBA routing, bookmark reactions, deadline reminders, taste rule ingestion). The scheduler registry, env configuration, and gateway intents are all in place for subsequent Phase 6 plans.

---

*Phase: 06-delivery-local-social-coverage*
*Completed: 2026-10-17*
