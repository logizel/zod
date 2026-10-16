# Phase 6: Delivery + Local/Social Coverage - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

All 10 Discord channels route correctly with reminders and bookmarks, fed by local DK/Udupi, relay, and social sources. This phase delivers the remaining ingestion pipelines (local domain crawler, X/LinkedIn social polling, Discord announcements relay), the full event routing matrix (local/travel/TBA buckets), the 📌 bookmark + deadline reminder system, and the taste-rules feedback loop from #🧠-bot-training-chat.

</domain>

<decisions>
## Implementation Decisions

### Local DK/Udupi Crawler (ING-02, EVT-03, EVT-04)

- **D-01:** Domain inventory = **Hybrid** — code defaults (NITK, MIT Manipal, NMAMIT, SJEC, Sahyadri, MITE, AJIET, St. Aloysius, SOSC, GDG/FOSS domains) + `LOCAL_WATCHLIST_DOMAINS` env override (comma-separated). Operator can extend without redeploy. — **Reversibility:** reversible — env override is additive; code defaults can be updated any time
- **D-02:** Geo classification = **Location-primary** — event location text / venue city is the primary signal; organizer city is secondary; "selection round" / "registration" keyword distinguishes travel-curated (has selection) from walk-in-reject (no selection round). Local DK/Udupi offline events route to `#📍-local-dk-udupi` regardless of prize size. Out-of-town offline with verified selection round routes to `#✈️-travel-curated`. Walk-in low-effort out-of-town rejected. — **Reversibility:** reversible — routing rules are config/logic, adjustable per organizer feedback
- **D-03:** Bio-link watcher = **Browser page poll** — poll full page via shared Playwright browser (bio-links are JS-rendered, need headless rendering). Reuses the existing `packages/browser` singleton + tab queue. — **Reversibility:** reversible — polling mechanism is internal

### Announcements Relay + Bookmarks + Reminders (ING-04, UI-02)

- **D-04:** Relay mechanism = **Polling timer** — poll external Discord #announcements on a timer (bounded latency, no cross-guild bot membership needed). Bot reads new posts and relays into private #raw-incoming-feeds. Avoids gateway listener complexity and cross-guild bot invitation requirements. — **Reversibility:** reversible — can upgrade to gateway listener later if latency matters
- **D-05:** Bookmark emoji = **Custom server emoji** — avoids unicode 📌 rendering issues across Discord clients. Bot listens for `MessageReactionAdd` with the custom emoji on audit cards, sets `bookmark=true` on the opportunity row, arms deadline reminders. — **Reversibility:** reversible — emoji ID is config
- **D-06:** Reminder anchor = **Event date** — 48h/24h deadline reminders count down to `deadlines.event_start` / `deadlines.apply_by` (the actual deadline), not post time. Reminders stored in `opportunities.reminders[]` with `{ at, channel, sent }` shape. — **Reversibility:** reversible — reminder scheduling logic is internal

### X/LinkedIn Session-Cookie Polling (ING-05)

- **D-07:** Cookie storage = **Exported cookies file on disk** — burner session cookies exported from a browser session to a JSON file on the VM. Easiest to rotate/export from burner browser. Read at tick time by the social poll job. — **Reversibility:** reversible — file path is config
- **D-08:** Human pacing = **30–90s jitter between requests, max 5 actions per tick** — conservative pacing to avoid rate-limit bans on X/LinkedIn. Jitter range prevents pattern detection. — **Reversibility:** reversible — pacing constants are config
- **D-09:** Search-index fallback = **None** — accept coverage gaps when direct polling is blocked/rate-limited. Keep it simple, zero-cost. No search-engine scraping fallback. — **Reversibility:** reversible — can add fallback later if coverage gaps prove painful

### TBA Two-Ping 48h Loop + Taste Rules (EVT-06, MEM-04)

- **D-10:** TBA re-audit = **Reuse existing audit-drain** (every 5m + 60s jitter) — scan `deadlines.tba=true` rows whose last audit was >48h ago, re-audit them, until the event date/time arrives. Ping #1 fires when TBA detected (routes to `#⏳-early-tba-radar` with `WATCHING_TBA` status). Ping #2 fires when prize/date is confirmed or event passes. No new scheduler job needed. — **Reversibility:** reversible — scan logic is internal to audit-drain
- **D-11:** Training-chat → taste rule = **All 3 paths supported** — (1) Reaction-based: 👍/👎 on an audit card → BOOST/BLOCK rule; (2) Keyword command: operator types a rule directly in #🧠-bot-training-chat; (3) DM to bot: operator DMs the bot a rule. All three create/update `taste_rules` rows in PocketBase. Confirmation reply posted in the channel. — **Reversibility:** reversible — rule ingestion paths are additive
- **D-12:** Taste rule application = **Hybrid** — BLOCK rules = pre-scoring filter (checked before LLM runs; auto-rejects + tombstones, never reaches the auditor — saves free-tier LLM quota). BOOST/WEIGHT/CUSTOM rules = system-prompt injection (appended to auditor's system prompt as advisory signals; LLM retains final judgment). — **Reversibility:** reversible — rule application logic is internal
- **D-13:** Taste rule precedence = **Taste BLOCK overrides soft/personal gates but NOT hard compliance gates** — hard gates (2+yr roles, unpaid non-fellowships, pay-to-training, US/EU-only swag) are mission-non-negotiable per PROJECT.md out-of-scope and cannot be overridden by taste rules. — **Reversibility:** reversible — precedence logic is internal

### the agent's Discretion

- Exact cron expressions for new poll jobs (within the already-decided cadence windows: local 2–4h, social 45–90m jitter)
- Internal data flow for relay (how polled announcements map to #raw-incoming-feeds posts)
- Reminder ticker implementation details (how `reminders[]` rows are scanned and fired)
- Taste rule schema extension beyond the existing `{ kind, rule, weight, created_at }` shape if needed
- Bio-link page change-detection heuristics (what constitutes a "new" bio-link opportunity)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Definition
- `.planning/ROADMAP.md` — Phase 6 goal, requirements, success criteria
- `.planning/REQUIREMENTS.md` — ING-02, ING-04, ING-05, EVT-03, EVT-04, EVT-06, UI-02, MEM-04 (traceability table)
- `.planning/PROJECT.md` — constraints (zero-cost, burner-cookie compliance, polling cadences), key decisions carried forward

### Schema + Pipeline Contract
- `packages/db-hot/src/schema.ts` — PIPELINES enum (`events|jobs|loot|local|social`), `opportunities` schema (`deadlines.tba`, `reminders[]`, `bookmark`, `end_date`), `taste_rules` collection shape, `HOT_COLLECTIONS` registry

### Scheduler + Poll Infrastructure
- `packages/scheduler/src/jobs.ts` — `STUB_JOBS` (local-stub 3h, social-stub hourly), `JOB_POLL_JOBS`, `AUDIT_JOBS` (audit-drain 5m), `CandidateSource` interface, `runStubTick` candidate pipeline
- `packages/scheduler/src/registry.ts` — single scheduler registry owning all `cron.schedule()` calls

### Discord Routing
- `packages/discord-router/src/router-service.ts` — `resolveChannel` (env-ID-first + name fallback), `processOpportunity`, router poll loop (`status = 'audited'`)
- `packages/discord-router/src/embed.ts` — `buildAuditCard` (renders tba flag, prize breakdown, audit summary)
- `packages/discord-router/src/gateway.ts` — Discord gateway client singleton

### Orchestrator + Rule Packs
- `packages/orchestrator/src/rule-packs/events.ts` — events audit rule pack (system+user message builder, verdict schema)
- `packages/orchestrator/src/orchestrator.ts` — STEP_2 audit drain, cross-pipeline drain ledger

### Config
- `packages/config/src/env.ts` — `EnvSchema` (fail-fast env gate), existing channel ID keys, `FELLOWSHIP_ALLOWLIST_EXTRA` pattern for env extension

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CandidateSource` interface (`list()` + optional `detail()`): new local/social sources plug in without structural change to the tick pipeline
- `resolveChannel` env-ID-first + name fallback: new bucket channels (`#📍-local-dk-udupi`, `#✈️-travel-curated`, `#⏳-early-tba-radar`, `#raw-incoming-feeds`, `#🧠-bot-training-chat`) resolve via env keys or exact-name match
- `buildAuditCard` embed builder: already renders tba flag, prize breakdown, audit summary — extends to local/travel/TBA buckets
- `packages/browser` singleton + tab queue: bio-link page polling reuses the shared Playwright instance
- `taste_rules` collection + `TasteRule` schema: already defined, seeded empty — Phase 6 writes arrive
- `opportunities.reminders[]` + `bookmark` + `deadlines.tba` fields: already in schema, ready for population
- `audit-drain` job (every 5m): TBA re-audit reuses this existing scan

### Established Patterns
- One scheduler registry owns all `cron.schedule()` calls — new poll jobs register through `registry.ts`, never scattered `setInterval`
- `runStubTick` candidate pipeline: precheck → intake merge → scout prefilter → listing screen → scratchpad resume → fetch → STEP_2. New sources (local, social) ride this exact pipeline via `candidateSources` injection
- `PocketBase` collection updates via `pb.collection('opportunities').update(id, fields)` — bookmark/reminder/taste-rule writes follow this pattern
- Env extension pattern: `FELLOWSHIP_ALLOWLIST_EXTRA` env merges into config default — `LOCAL_WATCHLIST_DOMAINS` follows the same pattern
- `zod` schema validation at every boundary — new data shapes (taste rules, local candidates) get `.parse()`'d

### Integration Points
- `packages/scheduler/src/registry.ts` — register new local-poll and social-poll cron jobs alongside existing portal/jobs/loot jobs
- `packages/discord-router/src/router-service.ts` — relay posts + reminder posts extend the existing poll loop or add a sibling service
- `packages/orchestrator/src/orchestrator.ts` — TBA re-audit extends the audit-drain scan; taste-rule injection extends the rule-pack message builder
- `packages/config/src/env.ts` — new env keys for local watchlist, social cookie path, bookmark emoji ID, training-chat channel ID

</code_context>

<specifics>
## Specific Ideas

- Taste rule confirmation reply should be posted in #🧠-bot-training-chat (not DM) so the operator sees it applied
- TBA Ping #1 → `#⏳-early-tba-radar` with `WATCHING_TBA` status; Ping #2 when prize/date confirmed or event date passes
- Local crawler should respect the 2–4h cadence (local-stub already defined at 3h + 20m jitter)
- Social polling should respect the 45–90m jitter cadence (social-stub already defined at hourly + 25m jitter)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 6-Delivery + Local/Social Coverage*
*Context gathered: 2026-10-16*
