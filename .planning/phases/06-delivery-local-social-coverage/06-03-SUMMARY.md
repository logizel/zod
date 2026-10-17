---
phase: 06-delivery-local-social-coverage
plan: 03
subsystem: discord-router
tags: [discord.js, bookmark, reminder, scheduler, pocketbase, zod, vitest]

# Dependency graph
requires:
  - phase: 06-delivery-local-social-coverage
    plan: 02
    provides: Local/travel/TBA routing matrix, TBA two-ping re-audit, scheduler registry, gateway intents, CHANNEL_ID_ENV_KEYS, resolveChannel
provides:
  - 📌 bookmark reaction handler — custom server emoji → bookmark=true + arm 48h/24h deadline reminders (UI-02, D-05, D-06)
  - Reminder ticker — scans bookmarked opportunities, fires 48h/24h reminders anchored on event dates (UI-02, D-06)
  - discord_message_id field on Opportunity schema (one-way migration, nullable default) for bookmark lookup by message ID
  - router-service stores discord_message_id on opportunity row after channel.send
  - reminder-tick job registered through scheduler registry (GATEWAY_JOBS + registerGatewayJobs tickHandler)
affects:
  - 06-04 (dashboard, telemetry)
  - 06-02 (uses discord_message_id for bookmark lookup on audit cards)

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 12800
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - discord.js messageReactionAdd listener with custom emoji ID matching (BOOKMARK_EMOJI_ID)
    - Partial message handling via reaction.message.fetch() before processing (Pitfall 2)
    - Reminder computation anchored on deadlines.event_start / deadlines.apply_by (D-06)
    - Immediate sent-flag update after reminder posting to prevent double-firing (Pitfall 6)
    - Per-opportunity error isolation in reminder batch scan
    - Scheduler registry single-ownership: reminder-tick registered via registerGatewayJobs tickHandler, no setInterval

key-files:
  created:
    - packages/discord-router/src/bookmark.ts - Bookmark reaction handler (startBookmarkHandler, createBookmarkHandler, computeReminders)
    - packages/discord-router/src/bookmark.test.ts - 8 unit tests for bookmark handler
    - packages/discord-router/src/reminder.ts - Reminder ticker (createReminderTick, reminderTick, formatReminder)
    - packages/discord-router/src/reminder.test.ts - 6 unit tests for reminder ticker
  modified:
    - packages/db-hot/src/schema.ts - Added discord_message_id: z.string().default('') to Opportunity schema
    - packages/discord-router/src/gateway.ts - Start bookmark handler at boot after client.login()
    - packages/discord-router/src/router-service.ts - Store discord_message_id on opportunity row after channel.send
    - packages/scheduler/src/jobs.ts - Add reminder-tick to GATEWAY_JOBS (every 15m + 5m jitter)
    - apps/scheduler/src/registry-start.ts - Register reminder-tick via registerGatewayJobs tickHandler alongside relay-poll

key-decisions:
  - "Followed plan exactly as specified — all D-05/D-06 decisions from 06-CONTEXT.md and 06-RESEARCH.md implemented as documented"
  - "Bookmark emoji is custom server emoji (BOOKMARK_EMOJI_ID), not unicode 📌 — per D-05 for cross-client rendering consistency"
  - "Reminder anchor is event date (deadlines.event_start / deadlines.apply_by), not post time — per D-06"
  - "reminder-tick registered through existing scheduler registry (registerGatewayJobs) — no new scheduler job or setInterval scatter"

patterns-established:
  - "Bookmark handler: gateway event listener → PB lookup by discord_message_id → update bookmark + reminders → confirmation reply"
  - "Reminder ticker: scan bookmark=true → filter reminders sent=false && at<=now → resolveChannel → channel.send → mark sent=true → PB update"
  - "All gateway event handlers and tickers use injectable deps (env, log, pb, client) for testability"

requirements-completed: [UI-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: Custom emoji reaction on audit card sets bookmark=true on opportunity row and arms 48h/24h reminders
    requirement: UI-02
    verification:
      - kind: unit
        ref: packages/discord-router/src/bookmark.test.ts#bookmark handler
        status: pass
    human_judgment: false
  - id: D2
    description: Reminder ticker scans every 15m, fires due reminders, marks sent immediately to prevent double-firing
    requirement: UI-02
    verification:
      - kind: unit
        ref: packages/discord-router/src/reminder.test.ts#reminder ticker
        status: pass
    human_judgment: false
  - id: D3
    description: discord_message_id stored on opportunity row after channel.send, enabling bookmark lookup by message ID
    requirement: UI-02
    verification:
      - kind: unit
        ref: packages/discord-router/src/router-service.test.ts#processOpportunity
        status: pass
    human_judgment: false

# Metrics
duration: 40min
completed: 2026-10-17
status: complete
---

# Phase 06 Plan 03: Bookmark Reactions + Deadline Reminder Ticker Summary

**📌 Bookmark reaction handler with custom server emoji → bookmark=true + 48h/24h deadline reminders anchored on event dates, plus reminder ticker firing due reminders via scheduler registry — all with discord_message_id schema migration.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-10-17T10:25:00Z
- **Completed:** 2026-10-17T11:05:00Z
- **Tasks:** 2 completed
- **Commits:** 3

## Accomplishments

- Task 1 (tracer): Bookmark reaction handler — listens for `messageReactionAdd` with custom bookmark emoji (BOOKMARK_EMOJI_ID), ignores bot reactions and non-matching emoji, fetches partial messages before processing, looks up opportunity by discord_message_id, sets `bookmark=true`, arms 48h/24h reminders anchored on `deadlines.event_start` / `deadlines.apply_by` (future-only), posts confirmation reply
- `discord_message_id` field added to Opportunity schema via one-way migration (nullable default, no new collection)
- `processOpportunity` in router-service now stores `discord_message_id` on the opportunity row after `channel.send`, enabling bookmark lookup by reaction message ID
- Bookmark handler started at gateway boot after `client.login()` (GuildMessageReactions intent already present from Plan 01)
- Task 2 (auto): Reminder ticker — scans bookmarked opportunities, fires reminders where `sent=false && at <= now`, posts to bucket_channel via `resolveChannel`, marks reminders `sent=true` immediately after posting (prevents double-firing), per-opportunity error isolation
- `reminder-tick` job registered in `GATEWAY_JOBS` (every 15m + 5m jitter) and wired through `registerGatewayJobs` tickHandler alongside `relay-poll`
- All 14 new unit tests pass (8 bookmark + 6 reminder); existing router-service tests still pass (8/8)

## Task Commits

Each task was committed atomically:

1. **Task 1: Bookmark reaction handler — custom emoji → bookmark=true + arm deadline reminders (tracer)** - `fd52297` (feat)
2. **Task 2: Reminder ticker — scan reminders[] and fire 48h/24h deadline posts (auto)** - `ff95580` (feat)
3. **Task 2 test fix: reminder test assertions** - `8fba601` (fix)

**Plan metadata commit:** pending (this SUMMARY commit)

## Files Created/Modified

- `packages/discord-router/src/bookmark.ts` — Bookmark reaction handler (new)
- `packages/discord-router/src/bookmark.test.ts` — 8 unit tests for bookmark handler (new)
- `packages/discord-router/src/reminder.ts` — Reminder ticker service (new)
- `packages/discord-router/src/reminder.test.ts` — 6 unit tests for reminder ticker (new)
- `packages/db-hot/src/schema.ts` — Added `discord_message_id: z.string().default('')` to Opportunity schema (modified)
- `packages/discord-router/src/gateway.ts` — Start bookmark handler at boot (modified)
- `packages/discord-router/src/router-service.ts` — Store `discord_message_id` after `channel.send` (modified)
- `packages/scheduler/src/jobs.ts` — Added `reminder-tick` to `GATEWAY_JOBS` (modified)
- `apps/scheduler/src/registry-start.ts` — Register `reminder-tick` via `registerGatewayJobs` tickHandler (modified)

## Decisions Made

- Followed the plan exactly as specified — all D-nnn decisions from 06-CONTEXT.md and 06-RESEARCH.md were implemented as documented
- No new scheduler jobs created outside the registry — `reminder-tick` registered through `registerGatewayJobs` tickHandler
- No package installs required — all dependencies already in stack (discord.js, zod, kelektiv/node-cron, vitest)

## Deviations from Plan

None - plan executed exactly as written. All implementation steps, done criteria, and verification commands were followed.

## Issues Encountered

- `reminderTick` returns `Promise<void>` per plan spec, so tests use `createReminderTick` (which returns `ReminderTickResult`) for result assertions
- Initial test data used future timestamps for reminders that should be due — fixed to use past timestamps for `at <= now` comparison
- Em dash in test name caused esbuild transform error — replaced with hyphen
- All issues resolved during implementation; no blockers remain

## User Setup Required

Per the plan's `user_setup` frontmatter:
- **Discord bookmark emoji**: Custom bookmark emoji must be created on the Discord server before bot deployment (Server Settings → Emojis → Copy ID) — referenced by `BOOKMARK_EMOJI_ID` env key (already in `EnvSchema` with default `''`)

## Next Phase Readiness

Plan 06-03 is complete. Bookmark reactions and deadline reminders are fully implemented and tested. Ready for Plan 06-04 (dashboard, telemetry) or subsequent phase work.

---

*Phase: 06-delivery-local-social-coverage*
*Completed: 2026-10-17*
