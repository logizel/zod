codex review failed or returned empty output. stderr:
2026-10-17T06:30:00.574395Z ERROR codex_login::auth::manager: Failed to refresh token: 401 Unauthorized: {
  "error": {
    "message": "Could not validate your refresh token. Please try signing in again.",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_refresh_token"
  }
}
2026-10-17T06:30:00.574546Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:00.608879Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:00.671364Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:00.697488Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:01.047295Z ERROR codex_models_manager::manager: failed to refresh available models: unexpected status 401 Unauthorized: Could not parse your authentication token. Please try signing in again., url: https://chatgpt.com/backend-api/codex/models?client_version=0.139.0, cf-ray: a4bd408f1db6384f-CJB, request id: req_66e58a0f6fcf4b07bc9591dbeaf7f966, auth error: 401, auth error code: unauthorized_unknown
2026-10-17T06:30:01.083809Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
OpenAI Codex v0.139.0
--------
workdir: /home/jizelxprince/projects/zod-root/zod
model: gpt-5.5
provider: openai
approval: never
sandbox: read-only
reasoning effort: high
reasoning summaries: none
session id: 01a1488d-9659-7ad3-be21-8f63573d2bc4
--------
user
# Cross-AI Plan Review Request

You are reviewing implementation plans for a software project phase.
Provide structured feedback on plan quality, completeness, and risks.

## Project Context

# Zod (Autonomous Opportunity-Intelligence Swarm)

## What This Is

Zod is a self-hosted, 24/7 autonomous multi-agent system that discovers, audits, deduplicates, and routes high-signal technical opportunities across three parallel pipelines: tech events/hackathons, fresher/intern jobs, and zero-cost developer perks. It exposes a split-channel interface: a Discord bot for routed alerts across 10 channels plus a locked real-time web telemetry dashboard (read-only v1) behind Cloudflare Zero Trust.

## Core Value

Only verified, deduplicated, high-signal opportunities reach Discord — every online event has audited cash ≥₹1,00,000 or a real perk with India shipping, every job is true 0–1yr/intern, every alert links the official source.

## Requirements

### Validated

- ✓ Poll job/fellowship portals (Greenhouse, Lever, Ashby, Workday, YC, Wellfound, Cutshort, Cuvette, LFX, GSoC, MLH) every 30–60m — Phase 5
- ✓ Enforce job rules: India + India-eligible remote, 0–1yr/intern verification with 2yr+/scam rejection, Sys/Cloud/DevOps vs General SWE routing — Phase 5
- ✓ Enforce loot rules: trash-to-treasure divert gate, credit/voucher/swag verification with India-shipping check — Phase 5
- ✓ Fuzzy duplicate merger (≥0.9 title + ±3d + organizer/company evidence) — Phase 5 (EVT-07)

### Active

- [ ] Discover structured event portals (Unstop, Devfolio, Devpost, Luma, Meetup, CTFtime, CLIST.by) via APIs/RSS first, headless fallback, 15–30m poll
- [ ] Watch DK & Udupi local list (NITK, MIT Manipal, NMAMIT, SJEC, Sahyadri, MITE, AJIET, St. Aloysius, SOSC, GDG/FOSS) via domain crawler + bio-link watcher, 2–4h
- [ ] Relay Discord #announcements natively via Bot Gateway into #raw-incoming-feeds (no self-bot)
- [ ] Poll X/LinkedIn via session-cookie + 45–90m jitter + search-index fallback
- [ ] Run Scout → Link-Hopper (2 hops max) → Deep-Auditor → Chief Curator with atomic Task_Scratchpad and 429/413 baton-pass + length-stitch
- [ ] Enforce event rules: Sys/CP/Sec fast-track, 80/20 domain filter, 3-bucket geo/prize (Local / Travel-selected / Online ₹1L+), TBA two-ping 48h loop
- [ ] Persist hot memory (PocketBase: opportunities + agent_telemetry), cold tombstones + taste_rules (Turso), midnight GC purge with permanent fingerprints
- [ ] Route 10 Discord channels with audit cards, deadline reminders, bookmark reactions, #🧠-bot-training-chat taste learning
- [ ] Serve locked dashboard: Zero Trust gate, rolling agent slots over PocketBase SSE, 2D pool health grid, read-only opportunity/audit boards via Cloudflare Tunnel

### Out of Scope

- Manual dashboard mutations (v1 read-only) — keeps audit trail single-writer
- US/EU-only swag without India shipping — violates loot mission
- 2+yr experience roles, unpaid non-fellowships, pay-for-training scams — not fresher-true
- Non-technical business/management events — out of 80/20 domain
- Walk-in low-effort out-of-town events without selection round — travel noise
- Real-time chat / mobile app — not needed for alert-routing value

## Context

- Target runtime: Oracle Cloud Always-Free ARM Ampere (2–4 OCPUs, 12–24GB RAM, 200GB, 10TB egress), 24/7, zero monthly cost across compute/storage/LLM free tiers
- Hot DB: PocketBase single-binary SQLite WAL on VM, native SSE; Cold: Turso (5GB, 500M reads) for tombstone_ledger + taste_rules surviving VM rebuild
- Sanitizer: Crawl4AI/Jina + 1 shared headless browser (Playwright), strip scripts/styles/SVG/nav (85–90% token cut), max 2–3 tabs, images/fonts disabled
- Network: Cloudflare Pages/Vercel dashboard → cloudflared tunnel, zero open inbound ports
- LLM swarm 2D ladder: Tier1 Groq (llama-3.1-8b-instant, llama-4-scout, qwen3-32b, kimi-k2, gpt-oss-120b/20b, llama-3.3-70b) / Cerebras (llama3.1-8b, gpt-oss-120b, qwen-3-235b, glm-4.7) / GitHub Models (gpt-4.1-mini/4.1, o4-mini, llama-4-maverick) / SambaNova (llama-3.3-70B, R1, Qwen3-32B); Tier2 Mistral pool, Z.ai GLM-4.7-Flash, NVIDIA NIM/Cohere/OpenRouter :free overflow
- Language: TypeScript monorepo (discord.js + Playwright + PocketBase SDK native)
- Prior research: none yet — research-first selected, will populate `.planning/research/`

## Constraints

- **Cost**: Zero monthly infra + LLM — permanent free tiers only
- **Compute**: Oracle ARM idle reclaim — hold 22–30% RAM via 2.5GB cache buffer
- **Hop**: Link-Hopper hard max 2 hops (Feed → Aggregator → Official/ATS)
- **Browser**: 1 shared instance, max 2–3 queued tabs, media loading off
- **Polling**: Events 15–30m, DK/Udupi 2–4h, Jobs 30–60m, X/LI 45–90m jitter
- **Auth**: Cloudflare Zero Trust owner-only wall, reject before UI/SSE render
- **Compliance**: Discord Gateway only, burner-cookie X/LI with human pacing
- **Prize**: Online events need verified liquid cash ≥₹1,00,000 (credits/vouchers stripped); swag must ship India/global

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Turso over Cloudflare D1 for cold ledger | 5GB + 500M reads, survives VM rebuild, simple SQLite replica | — Pending |
| Cloudflare Zero Trust over Discord-OAuth gate | Hard login wall at edge, zero app auth code, covers SSE too | — Pending |
| TypeScript monorepo (discord.js + Playwright) | Native bot + browser + PB SDK, one toolchain on ARM | — Pending |
| PocketBase hot + Turso cold split | Zero-latency local ops + off-server permanent memory, no Supabase pauses | — Pending |
| Tunnel with zero inbound ports | Oracle firewall stays closed, encrypted Pages→VM path | — Pending |
| 2D per-model bucket rotation + scratchpad handoff | Survives 429/413/length mid-STEP_3 without re-scraping | — Pending |
| Research-first before requirements | Validate stack/features/arch/pitfalls against live docs | — Pending |
| MVP vertical slices for roadmap | Working alert slice fast, then add pipelines | — Pending |
| D-14 one-way schema migration | Nullable/defaulted fields only, no new collection; Phase 4 rows parse via defaults | Shipped Phase 5 (05-08) |
| resolveChannel env-ID-first | Bucket→env channel ID mapping before exact-name fallback; unknown keeps skip path | Shipped Phase 5 (05-08) |
| .env.example bijective with EnvSchema | 3 channel keys + 4 Pitfall-10 drift keys; bijection guard in 05-06 | Shipped Phase 5 (05-06, 05-08) |
| D-02 seed + auto-learn board rotation | extractBoardUrl (3 ATS hosts), learnBoard idempotent + capped 200, next-tick fan-out | Shipped Phase 5 (05-02) |
| Workday cxs JSON + browser fallback | cxs JSON first ([ASSUMED A1]), exactly-one fetchViaBrowser fallback | Shipped Phase 5 (05-02) |
| DEFAULT_FELLOWSHIP_ALLOWLIST | LFX/GSoC/MLH defaults + FELLOWSHIP_ALLOWLIST_EXTRA env, fail-closed | Shipped Phase 5 (05-03) |
| D-04 senior screen | Whole-word case-insensitive title regex; Leadership/Managerial don't match | Shipped Phase 5 (05-03) |

---

## Phase 06: Delivery + Local/Social Coverage

### Roadmap Section

### Phase 6: Delivery + Local/Social Coverage

**Goal**: All 10 channels route correctly with reminders and bookmarks, fed by local, relay, and social sources
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: ING-02, ING-04, ING-05, EVT-03, EVT-04, EVT-06, UI-02, MEM-04
**Success Criteria** (what must be TRUE):
  1. User sees local DK/Udupi offline events in #📍-local-dk-udupi regardless of prize size, and quality out-of-town events with a selection round in #✈️-travel-curated
  2. A legit TBA-prize event fires Ping #1 to #⏳-early-tba-radar and gets re-audited on the 48h loop
  3. User reacts 📌 to an opportunity and receives its 48h/24h deadline reminders
  4. An external Discord #announcements post appears in #raw-incoming-feeds via the official Gateway relay
  5. Feedback posted in #🧠-bot-training-chat produces a confirmation reply and changes subsequent Auditor/Curator verdicts

**Plans**: 4/4 plans executed

**Wave 1**
- [x] 06-01-PLAN.md — Ingestion tracer: local DK/Udupi source + announcements relay + X/LinkedIn social source (ING-02, ING-04, ING-05)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 06-02-PLAN.md — Routing: local geo classification + travel-curated selection + TBA two-ping 48h loop (EVT-03, EVT-04, EVT-06)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 06-03-PLAN.md — Delivery: bookmark reaction handler + 48h/24h deadline reminder ticker (UI-02)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 06-04-PLAN.md — Feedback: taste rule ingestion (3 paths) + taste rule application (BLOCK pre-scoring + BOOST prompt injection) (MEM-04)

**UI hint**: yes

### Requirements Addressed

From `.planning/REQUIREMENTS.md`:

| ID | Description |
|----|-------------|
| ING-02 | System crawls DK & Udupi college/community watchlist domains and bio-link pages every 2–4 hours |
| ING-04 | Bot relays external Discord #announcements into private #raw-incoming-feeds via official Bot Gateway (no self-bot) |
| ING-05 | System polls X/LinkedIn via exported session cookies on randomized 45–90 minute jitter plus search-index fallback |
| EVT-03 | Local DK/Udupi offline events route to #📍-local-dk-udupi regardless of prize size |
| EVT-04 | Out-of-town offline events require verified selection round + quality to reach #✈️-travel-curated; walk-in low-effort rejected |
| EVT-06 | Legit TBA prize/agenda events fire Ping #1 to #⏳-early-tba-radar with WATCHING_TBA status and re-audit every 48h until Ping #2 |
| UI-02 | 📌 reaction bookmarks an opportunity and arms its deadline reminders |
| MEM-04 | Cold `taste_rules` (BLOCK/BOOST/WEIGHT/CUSTOM) inject into Auditor/Curator prompts from #🧠-bot-training-chat feedback with confirmation reply |

### User Decisions (CONTEXT.md)

Full context from `.planning/phases/06-delivery-local-social-coverage/06-CONTEXT.md`:

**Phase Boundary:** All 10 Discord channels route correctly with reminders and bookmarks, fed by local DK/Udupi, relay, and social sources. This phase delivers the remaining ingestion pipelines (local domain crawler, X/LinkedIn social polling, Discord announcements relay), the full event routing matrix (local/travel/TBA buckets), the 📌 bookmark + deadline reminder system, and the taste-rules feedback loop from #🧠-bot-training-chat.

**Implementation Decisions:**

D-01: Domain inventory = Hybrid — code defaults (NITK, MIT Manipal, NMAMIT, SJEC, Sahyadri, MITE, AJIET, St. Aloysius, SOSC, GDG/FOSS domains) + `LOCAL_WATCHLIST_DOMAINS` env override.

D-02: Geo classification = Location-primary — event location text / venue city is primary; organizer city secondary. "Selection round"/"registration" keyword distinguishes travel-curated from walk-in-reject. Local DK/Udupi offline → #📍-local-dk-udupi regardless of prize. Out-of-town offline + selection round → #✈️-travel-curated. Walk-in out-of-town rejected.

D-03: Bio-link watcher = Browser page poll via shared Playwright singleton + tab queue.

D-04: Relay mechanism = Polling timer — polls external #announcements, relays to #raw-incoming-feeds. No cross-guild bot membership needed.

D-05: Bookmark emoji = Custom server emoji (not unicode 📌). GuildMessageReactions + custom emoji ID match.

D-06: Reminder anchor = Event date — 48h/24h reminders count down to deadlines.event_start / deadlines.apply_by.

D-07: Cookie storage = Exported cookies file on disk at SOCIAL_COOKIES_PATH.

D-08: Human pacing = 30–90s jitter between requests, max 5 actions per tick.

D-09: Search-index fallback = None — accept coverage gaps.

D-10: TBA re-audit = Reuse existing audit-drain (every 5m). No new scheduler job.

D-11: Training-chat → taste rule = All 3 paths (reaction, keyword, DM).

D-12: Taste rule application = Hybrid — BLOCK = pre-scoring filter, BOOST/WEIGHT/CUSTOM = system-prompt injection.

D-13: Taste rule precedence = Taste BLOCK overrides soft/personal gates but NOT hard compliance gates.

### Research Findings

Full research from `.planning/phases/06-delivery-local-social-coverage/06-RESEARCH.md` (verified against existing codebase):

Phase 6 delivers five capability areas: (1) local DK/Udupi crawler, (2) X/LinkedIn session-cookie polling, (3) Discord #announcements relay, (4) bookmark reaction + reminder system, (5) taste-rules feedback loop. The codebase already has structural foundation: `PIPELINES` includes `local` and `social`, `opportunities` has `reminders[]`, `bookmark`, `deadlines.tba` fields, `taste_rules` collection seeded empty, `CandidateSource` interface + `runStubTick` pipeline accepts new sources. Existing `audit-drain` job (every 5m) is the reuse point for TBA re-audit.

Key integration points verified in existing code: `packages/scheduler/src/registry.ts` (single registry), `packages/scheduler/src/jobs.ts` (CandidateSource, runStubTick), `packages/discord-router/src/router-service.ts` (resolveChannel), `packages/discord-router/src/gateway.ts` (intents, partials), `packages/orchestrator/src/orchestrator.ts` (audit-drain), `packages/db-hot/src/schema.ts` (PIPELINES, opportunities schema), `packages/config/src/env.ts` (EnvSchema).

Anti-patterns to avoid: scattered setInterval, duplicating candidate pipeline, unicode bookmark emoji, new scheduler job for TBA, raw REST Discord calls, LLM prompt injection via taste rules into user messages.

### Plans to Review

#### .planning/phases/06-delivery-local-social-coverage/06-01-PLAN.md

---
phase: 06-delivery-local-social-coverage
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/discord-router/src/portals/local.ts
  - packages/discord-router/src/portals/social.ts
  - packages/discord-router/src/relay.ts
  - packages/config/src/env.ts
  - packages/discord-router/src/gateway.ts
  - packages/discord-router/src/router-service.ts
  - packages/scheduler/src/jobs.ts
  - apps/scheduler/src/registry-start.ts
  - .env.example
autonomous: true
requirements: [ING-02, ING-04, ING-05]
user_setup:
  - service: discord-bookmark-emoji
    why: "Custom bookmark emoji must be created on the Discord server before bot deployment (D-05)"
    dashboard_config:
      - task: "Create custom bookmark emoji on server"
        location: "Server Settings -> Emojis -> Upload Image"
  - service: x-linkedin-cookies
    why: "Burner session cookies must be exported from a browser session for social polling (D-07)"
    env_vars:
      - name: SOCIAL_COOKIES_PATH
        source: "Path to exported cookies JSON file on VM disk"

estimate:
  tokens: 70000
  raw_tokens: 35000
  tasks: 3
  confidence: med

must_haves:
  truths:
    - "localSource.list() returns PollCandidate[] from DK/Udupi college/community domains and bio-link pages"
    - "Relay service polls external #announcements and forwards new messages to #raw-incoming-feeds"
    - "socialSource.list() returns PollCandidate[] from X/LinkedIn with 30-90s jitter and max 5 actions per tick"
    - "Every env key added to EnvSchema has a matching placeholder in .env.example (bijection)"
    - "resolveChannel is exported from router-service.ts and resolves the five new bucket channels (env-ID-first, then exact-name fallback)"
    - "local-stub and social-stub carry candidateSource; local and social sources injected into scheduler registry candidateSources"
    - "relay-poll job registered through scheduler registry (registerGatewayJobs); last relayed message ID persisted in agent_telemetry"
  artifacts:
    - "packages/discord-router/src/portals/local.ts"
    - "packages/discord-router/src/portals/social.ts"
    - "packages/discord-router/src/relay.ts"
    - "packages/config/src/env.ts"
    - "packages/discord-router/src/router-service.ts"
    - "packages/scheduler/src/jobs.ts"
    - "apps/scheduler/src/registry-start.ts"
    - ".env.example"
  key_links:
    - "localSource plugs into runStubTick via candidateSources injection (local-stub candidateSource: 'local')"
    - "socialSource plugs into runStubTick via candidateSources injection (social-stub candidateSource: 'social')"
    - "resolveChannel exported from router-service.ts; relay.ts and reminder.ts import it from there"
    - "relay cursor (last relayed message ID) stored in PocketBase agent_telemetry (slot: 'relay-cursor')"
---

**Objective:** Wire local DK/Udupi domain crawling, Discord announcements relay, and X/LinkedIn social polling into the existing candidate pipeline, plus the scheduler registry and env configuration that all three sources depend on.

**Tasks:**
1. **Local DK/Udupi CandidateSource** (tracer) — Create local CandidateSource crawling DK/Udupi domains and bio-link pages. Add Phase 6 env keys to EnvSchema. Add GuildMessageReactions intent to gateway. Extend CHANNEL_ID_ENV_KEYS and export resolveChannel from router-service. Wire local-stub into STUB_JOBS and registry candidateSources.
2. **X/LinkedIn social polling** (auto) — Create social CandidateSource polling X/LinkedIn via exported cookies with 30-90s jitter, max 5 actions/tick. Wire social-stub into STUB_JOBS and registry.
3. **Discord announcements relay** (auto) — Create relay service polling external #announcements every 15m + 5m jitter, forwarding to #raw-incoming-feeds. Persist last relayed ID in agent_telemetry. Register relay-poll job. Add .env.example bijection.

**Must-have truths:** localSource.list() returns candidates; relay service forwards messages; socialSource.list() enforces jitter and max actions; env bijection; resolveChannel exported; candidateSources injected; relay-poll registered with cursor persistence.

#### .planning/phases/06-delivery-local-social-coverage/06-02-PLAN.md

---
phase: 06-delivery-local-social-coverage
plan: 02
type: execute
wave: 2
depends_on: [06-01]
files_modified:
  - packages/orchestrator/src/tba-loop.ts
  - packages/orchestrator/src/orchestrator.ts
  - packages/orchestrator/src/rule-packs/local.ts
autonomous: true
requirements: [EVT-03, EVT-04, EVT-06]

estimate:
  tokens: 80000
  raw_tokens: 40000
  tasks: 3
  confidence: med

must_haves:
  truths:
    - "Local DK/Udupi offline events route to #📍-local-dk-udupi regardless of prize size"
    - "Out-of-town offline events with verified selection round route to #✈️-travel-curated; walk-in low-effort rejected"
    - "TBA prize/date events fire Ping #1 to #⏳-early-tba-radar with WATCHING_TBA status when first detected (in processEventsRow and drainLocalRow)"
    - "TBA rows re-audit every 48h within the existing audit-drain tick; Ping #2 fires on prize/date confirmation or event expiry; tba flag cleared on terminal conditions"
  artifacts:
    - "packages/orchestrator/src/tba-loop.ts"
    - "packages/orchestrator/src/rule-packs/local.ts"
    - "packages/orchestrator/src/orchestrator.ts"
  key_links:
    - "processRow 'local' case → drainLocalRow → buildLocalMessages → geo classification → bucket routing"
    - "Ping #1 fires in processEventsRow (events pipeline) and drainLocalRow (local pipeline) when verdict has null prize_cash_inr and null dates"
    - "audit-drain tick → tbaReauditScan → Ping #1/#2 with terminal conditions (no new scheduler job)"
---

**Objective:** Route local and travel events correctly via location-primary geo classification, and implement the TBA two-ping 48h re-audit loop including Ping #1 fired at first TBA detection in processEventsRow.

**Tasks:**
1. **Local pipeline routing** (tracer) — Add 'local' case to processRow switch. Create local rule pack (LocalVerdictSchema, parseLocalVerdict, buildLocalMessages). Implement drainLocalRow with D-02 geo classification.
2. **Travel-curated routing** (auto) — Extend drainLocalRow for out-of-town offline + selection round → #✈️-travel-curated; walk-in → walk_in_rejected tombstone. Quality gate: organizer_score >= 5.
3. **TBA two-ping 48h re-audit loop** (auto) — Create tbaReauditScan running within audit-drain. Ping #1 on first TBA detection (processEventsRow + drainLocalRow). Ping #2 on confirmation/expiry. Terminal conditions prevent infinite loop.

**Must-have truths:** Local DK/Udupi offline → #📍-local-dk-udupi regardless of prize; out-of-town + selection → #✈️-travel-curated; walk-in rejected; TBA Ping #1 in both pipelines; TBA re-audit every 48h; terminal conditions prevent infinite loop.

#### .planning/phases/06-delivery-local-social-coverage/06-03-PLAN.md

---
phase: 06-delivery-local-social-coverage
plan: 03
type: execute
wave: 3
depends_on: [06-02]
files_modified:
  - packages/discord-router/src/bookmark.ts
  - packages/discord-router/src/reminder.ts
  - packages/discord-router/src/gateway.ts
  - packages/discord-router/src/router-service.ts
  - packages/db-hot/src/schema.ts
  - packages/scheduler/src/jobs.ts
  - apps/scheduler/src/registry-start.ts
autonomous: true
requirements: [UI-02]
user_setup:
  - service: discord-bookmark-emoji
    why: "Custom bookmark emoji must be created on the Discord server and its ID exported to BOOKMARK_EMOJI_ID env var"
    env_vars:
      - name: BOOKMARK_EMOJI_ID
        source: "Discord Server Settings -> Emojis -> right-click custom emoji -> Copy ID"

estimate:
  tokens: 60000
  raw_tokens: 30000
  tasks: 2
  confidence: med

must_haves:
  truths:
    - "Custom emoji reaction on an audit card sets bookmark=true on the opportunity and arms 48h/24h deadline reminders"
    - "Reminder ticker fires 48h/24h reminders anchored on deadlines.event_start / deadlines.apply_by (the actual deadline, not post time)"
    - "Reminders stored in opportunities.reminders[] with { at, channel, sent } shape; sent flag prevents double-firing"
    - "discord_message_id field added to the Opportunity schema via one-way migration (nullable default) so bookmark lookup by message ID works"
    - "reminder-tick job registered through scheduler registry (registerGatewayJobs) alongside relay-poll"
  artifacts:
    - "packages/discord-router/src/bookmark.ts"
    - "packages/discord-router/src/reminder.ts"
    - "packages/db-hot/src/schema.ts"
    - "apps/scheduler/src/registry-start.ts"
  key_links:
    - "messageReactionAdd → findOpportunityByMessageId (discord_message_id) → PB update bookmark=true + reminders[]"
    - "reminder-tick cron → scan reminders[] where sent=false && at <= now → channel.send → sent=true"
    - "router-service processOpportunity stores sent discord_message_id on the opportunity row after channel.send"
---

**Objective:** Deliver the 📌 bookmark reaction system and 48h/24h deadline reminder ticker anchored on event dates, including discord_message_id schema migration and scheduler registry wiring.

**Tasks:**
1. **Bookmark reaction handler** (tracer) — Create bookmark handler listening for messageReactionAdd with custom emoji. Add discord_message_id field to Opportunity schema (one-way migration). Store discord_message_id in router-service after channel.send. Start handler at boot in gateway.ts.
2. **Reminder ticker** (auto) — Create reminderTick scanning bookmarked opportunities, firing due reminders, marking sent=true immediately. Register reminder-tick job through scheduler registry alongside relay-poll.

**Must-have truths:** Custom emoji reaction sets bookmark=true + arms reminders; reminders anchored on event dates; reminders stored with sent flag; discord_message_id added to schema; reminder-tick registered through registry.

#### .planning/phases/06-delivery-local-social-coverage/06-04-PLAN.md

---
phase: 06-delivery-local-social-coverage
plan: 04
type: execute
wave: 4
depends_on: [06-03]
files_modified:
  - packages/discord-router/src/taste-ingest.ts
  - packages/orchestrator/src/taste-apply.ts
  - packages/orchestrator/src/rule-packs/events.ts
  - packages/orchestrator/src/orchestrator.ts
  - packages/discord-router/src/gateway.ts
autonomous: true
requirements: [MEM-04]

estimate:
  tokens: 60000
  raw_tokens: 30000
  tasks: 2
  confidence: med

must_haves:
  truths:
    - "Feedback posted in #🧠-bot-training-chat via reaction, keyword command, or DM creates/updates taste_rules rows in PocketBase with confirmation reply"
    - "BLOCK rules auto-reject candidates before the LLM runs (pre-scoring filter, saves free-tier quota)"
    - "BOOST/WEIGHT/CUSTOM rules are appended to the auditor system prompt as advisory signals; LLM retains final judgment"
    - "Taste rule precedence reconciled (D-12 + D-13): hard compliance gates run FIRST, then taste BLOCK pre-scoring filter (overrides soft/personal gates only, NOT hard compliance gates), then soft gates"
    - "BLOCK rule match: case-insensitive substring match of rule text against candidate title or snippet"
  artifacts:
    - "packages/discord-router/src/taste-ingest.ts"
    - "packages/orchestrator/src/taste-apply.ts"
    - "packages/orchestrator/src/rule-packs/events.ts"
  key_links:
    - "3 ingestion paths (reaction, keyword, DM) → PB taste_rules create → confirmation reply in originating channel"
    - "BLOCK rules → pre-scoring filter → tombstone taste_blocked (never reaches auditor)"
    - "BOOST/WEIGHT/CUSTOM → system prompt injection → LLM final judgment"
    - "Hard gates → taste BLOCK → soft gates (D-13 precedence; BLOCK cannot override hard compliance gates)"
---

**Objective:** Implement taste-rules feedback loop: three ingestion paths from operator feedback into PocketBase taste_rules, and hybrid application (BLOCK = pre-scoring filter, BOOST/WEIGHT/CUSTOM = system-prompt injection) with D-12/D-13 precedence reconciled.

**Tasks:**
1. **Taste rule ingestion** (tracer) — Create taste-ingestion service with 3 paths (reaction 👍/👎, keyword !rule command, DM). All create taste_rules rows in PB with confirmation reply in originating channel. Extend TasteRule schema with source field.
2. **Taste rule application** (auto) — Create taste-apply module: loadTasteRules, checkBlockRules (pre-scoring filter), buildTastePromptInjection (system-prompt injection), applyTastePreScoring. Wire into all 4 pipeline processors with D-12/D-13 precedence (hard gates → taste BLOCK → soft gates).

**Must-have truths:** 3 ingestion paths create taste_rules with confirmation; BLOCK rules auto-reject before LLM; BOOST/WEIGHT/CUSTOM are advisory system-prompt injection; hard gates first, taste BLOCK second, soft gates third; BLOCK match is case-insensitive substring.

---

## Plan Coverage Manifest

Total plans in this review: 4

Plan ids (give each one its own `##`-level section, headed verbatim):
- 06-01
- 06-02
- 06-03
- 06-04

---

## Review Instructions

**Verify against source — do not review the plan text in isolation.** The plans reference real files, migrations, routes, and tests in this repo.

1. Open the referenced files and check each claim against the actual code.
2. For every strength or concern, cite concrete `path/to/file:line` evidence plus the mechanism.
3. When a plan asserts a mechanism works (a guard, a query filter, a test that exercises a path), trace whether it actually does what is claimed — do not take the plan's word for it.
4. If you cannot read the repo (no file access), say so and downgrade that finding to an open question rather than asserting it.

Findings citing `file:line` evidence are weighted far more heavily than impressionistic ones; a review that only restates the plan's own claims has low value.

**Plan coverage is mandatory (#3301).** The exact list of plan ids and the total plan count for this review are given in the "## Plan Coverage Manifest" section above. Give **every** listed id its own `##`-level section headed with that id **verbatim** (e.g. `## 06-01`) before writing any cross-plan comparison, an overall risk assessment, or a consensus-style summary. A review that stops before every id has its own section is an incomplete review, not a summary — if you must stop early, say so explicitly and name which ids you did not reach.

Analyze each plan and provide:

1. **Summary** — One-paragraph assessment
2. **Strengths** — What's well-designed (bullet points)
3. **Concerns** — Potential issues, gaps, risks (bullet points with severity: HIGH/MEDIUM/LOW)
4. **Suggestions** — Specific improvements (bullet points)
5. **Risk Assessment** — Overall risk level (LOW/MEDIUM/HIGH) with justification

Focus on:
- Missing edge cases or error handling
- Dependency ordering issues
- Scope creep or over-engineering
- Security considerations
- Performance implications
- Whether the plans actually achieve the phase goals

Output your review in markdown format.
2026-10-17T06:30:01.208643Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:01.518542Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when UnexpectedContentType(Some("text/plain; body: {\n  \"error\": {\n    \"message\": \"Could not parse your authentication token. Please try signing in again.\",\n    \"type\": null,\n    \"code\": \"unauthorized_unknown\",\n    \"param\": null\n  },\n  \"status\": 401\n}"))
2026-10-17T06:30:01.551413Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:03.445367Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:03.479847Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:03.518638Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:04.427439Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
2026-10-17T06:30:04.501395Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:04.536384Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:04.572098Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:05.208330Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
2026-10-17T06:30:05.251056Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:06.033081Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:06.056241Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:06.077459Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:06.974416Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
2026-10-17T06:30:07.018235Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:07.040144Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:07.061597Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.
2026-10-17T06:30:07.825244Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
ERROR: Your access token could not be refreshed. Please log out and sign in again.
ERROR: Your access token could not be refreshed. Please log out and sign in again.

Diagnosis: codex ran at effort=high and exited with status 1.
