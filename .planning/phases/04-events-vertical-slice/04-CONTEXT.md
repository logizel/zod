# Phase 4: Events Vertical Slice - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers the first end-to-end verified event alert in Discord (MVP vertical slice). National-portal events (Unstop, Devfolio, Devpost, Luma, Meetup, CTFtime, CLIST.by) are polled every 15–30m (ING-01), pass Scout pre-filter (expiry + spam, zero fetch), resolve through Link-Hopper to the official event domain within 2 hops via HTTP redirect following (SWM-02), receive an auditor verdict via the LLM router (429/413 baton-pass, length-stitch), and post as a structured Discord audit card to the right channel:
- Sys/CP/Sec → #🔥-priority-sys-cp-sec after legitimacy check (EVT-01)
- Online with verified liquid cash ≥₹1L → #💻-online-1lakh-plus; credit-inflated rejected (EVT-05)
- Remaining verified events → #📋-events-general catch-all
- Non-technical business → rejected by 80/20 domain filter before the auditor (EVT-02)

Jobs/loot/local/social pipelines and their channels are deferred to Phase 5/6. Scope anchor: first verified Discord alert with an official source link.

</domain>

<decisions>
## Implementation Decisions

### Portal adapters & polling (ING-01)
- **D-01:** Wire all 7 national portals (Unstop, Devfolio, Devpost, Luma, Meetup, CTFtime, CLIST.by) at once with a dedicated parser per portal for the 15–30m poll. — **Reversibility:** costly — undo touches every portal adapter plus the poll scheduler wiring. Rationale: broader day-one coverage of national-portal events for the first verified alert.
- **D-02:** Stagger the 7 portals' polls across the 15–30m window rather than firing all simultaneously. — **Reversibility:** reversible — changes scheduler cron offsets only. Rationale: avoids thundering-herd on the shared 2-tab browser plus Jina rate limits; respects the Oracle ARM 2.5GB RAM budget.
- **D-03:** Portal adapter emits title+snippet from an RSS/JSON listing first; Scout pre-filter runs on that (zero fetch); full fetch happens only for survivors. — **Reversibility:** costly — undo reworks every adapter's fetch contract. Rationale: matches the RSS-before-headless cost rule and the Scout-before-any-scrape contract (Phase 2 D-19).

### Link-Hopper 2-hop resolution (SWM-02)
- **D-04:** Link-Hopper resolves aggregator→official domain BEFORE the auditor posts its verdict. — **Reversibility:** costly — undo moves resolution after the auditor and reworks the STEP machine ordering. Rationale: success criterion #4 requires the aggregator link to resolve to the official domain within 2 hops before any verdict is posted.
- **D-05:** A "hop" is resolved via HTTP redirect following (hop 1 = aggregator/social page, hop 2 = official event domain), not browser rendering. — **Reversibility:** reversible — contained in the Link-Hopper module. Rationale: lightweight, no shared-browser tab cost (1 shared browser, max 2–3 tabs, media off).
- **D-06:** A candidate that fails to resolve to an official domain within 2 hops is tombstoned as `link_hop_failed` and skipped. — **Reversibility:** reversible — undo changes the terminal_status written to tombstone_ledger. Rationale: protects the core value that every alert links the official source.

### Audit card & Discord routing (UI-01)
- **D-07:** Remaining verified events (beyond #🔥-priority-sys-cp-sec and #💻-online-1lakh-plus) route to a catch-all #📋-events-general channel in Phase 4; other 10-matrix channels (local, travel, TBA, loot, jobs) deferred to Phase 5/6. — **Reversibility:** reversible — channel list is config. Rationale: keeps Phase 4 scoped to the events vertical slice.
- **D-08:** The Discord audit card is a structured embed per UI-01: title, organizer, dates, prize breakdown (cash vs credits stripped), merged links [official + aggregator], 1-line audit from `audit_summary`. — **Reversibility:** reversible — embed field set lives in the router service. Rationale: matches UI-01 spec; all fields already exist on the Opportunity schema.
- **D-09:** Audit cards are posted by a dedicated Discord router service that polls opportunities with `status='audited'` + `bucket_channel`, posts the embed, then marks `status='routed'`. — **Reversibility:** costly — undo merges posting back into the auditor/curator and reworks retry handling for failed posts. Rationale: single Discord writer keeps the audit trail clean; the auditor stays focused on verdicts.

### Prize verification & 80/20 legitimacy (EVT-05/EVT-02)
- **D-10:** "Verified liquid cash ≥₹1L" requires explicit INR stated on the portal; credits/vouchers/certificates are stripped; `prize_cash_inr` null (TBA/unverified) does not qualify. — **Reversibility:** reversible — changes the prize-parsing predicate only. Rationale: matches EVT-05 exactly; success criterion #2 requires credit-inflated "₹5L prize" to NOT appear.
- **D-11:** The 80/20 domain filter runs BEFORE the auditor as a cheap pre-filter: admit all SWE domains, adjacent deep-tech only at organizer≥9 AND agenda≥9, reject non-technical business. — **Reversibility:** reversible — changes pre-filter ordering and scoring predicate. Rationale: matches EVT-02; keeps non-technical business events out of channels before any LLM spend (success criterion #5).

### the agent's Discretion
No "you decide" selections — the user chose a concrete option for every area discussed. Researcher/planner have flexibility on: exact per-portal parser implementation (RSS vs JSON shape per portal), exact cheerio strip selector list, stagger interval math within the 15–30m window, exact 80/20 scoring formula (thresholds organizer≥9 / agenda≥9 are locked), Discord embed styling/colors, and the router service poll interval — as long as the locked decisions above and the Phase 4 success criteria hold.

### Folded Todos
None — no todos matched Phase 4 in cross_reference_todos.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase goal & requirements
- `.planning/ROADMAP.md` §Phase 4 — phase goal ("first verified, deduplicated high-signal event alert in Discord"), requirements ING-01/SWM-02/EVT-01/EVT-02/EVT-05/UI-01, success criteria 1–5
- `.planning/REQUIREMENTS.md` — ING-01 (events portal polling 15–30m), SWM-02 (Link-Hopper 2 hops), EVT-01 (Sys/CP/Sec fast-track), EVT-02 (80/20 domain filter), EVT-05 (online events ≥₹1L verified cash), UI-01 (Discord audit cards), Traceability Phase 4 rows
- `.planning/PROJECT.md` — Context (stack, polling cadences), Constraints (zero cost, Link-Hopper max 2 hops, events 15–30m poll, prize ≥₹1L), Key Decisions ("MVP vertical slices — first verified Discord alert in Phase 4")

### Data contracts (reused by Phase 4)
- `packages/db-hot/src/schema.ts` — `Opportunity` (`fingerprint_hash`, `url_hash`, `pipeline`, `bucket_channel`, `status`, `title`, `organizer`, `links.official/aggregator`, `prize_cash_inr` null while TBA/unverified, `prize_text`, `deadlines.tba/apply_by/event_start/end`, `end_date`, `audit_summary`), `TaskScratchpad` (`step_position` STEP_1..STEP_4, `partial_buffer`), `OPPORTUNITY_STATUSES` (candidate/audited/routed/rejected/tombstoned/expired), `PIPELINES` (events|jobs|loot|local|social)
- `packages/db-hot/src/scratchpad.ts` — `getOrCreateScratchpad`, `advanceToStep2` (caps markdown at 8000), `recordFailure` (5 retries → tombstone), `resumeByUrl`
- `packages/llm/src/router.ts` — `LlmRouter.complete()` with `step1`+`step2` baton-pass, length-stitch, `UNVERIFIED`/`POOL_SATURATED`, priority lanes Curator>Auditor>Scout, `TelemetrySink`
- `packages/llm/src/telemetry.ts` — `writeBucketState` to `agent_telemetry`

### Scheduler + fetch pipeline
- `packages/scheduler/src/jobs.ts` — `STUB_JOBS` (events-stub every 20m + 5m jitter), `POLL_CANDIDATES` static stub list (real portal adapters land Phase 4), `runStubTick` = dedup precheck → Scout prefilter → scratchpad resume → fetch → STEP_2
- `packages/scout/src/index.ts` — `prefilter` (expiry then spam, zero fetch)
- `packages/sanitize/src/index.ts` — `fetch` (Jina-first, browser fallback), `sanitizeHtml`/`sanitizeMarkdown`, `MARKDOWN_CAP`, links kept
- `packages/browser/src/index.ts` — `fetchViaBrowser`, `shutdown` (shared singleton, max 2–3 tabs, media off)

### Configuration
- `packages/config/src/env.ts` — fail-fast `parseEnv` (PB_URL, PB_SERVICE_EMAIL/PASSWORD, JINA_API_KEY, TURSO_*, GROQ_API_KEY, GITHUB_TOKEN, SAMBANOVA_API_KEY, LOG_LEVEL); NOTE: no `DISCORD_TOKEN` in schema yet — add before the Discord router constructs

### Runtime/stack
- AGENTS.md (project root) — Technology Stack and Constraints sections

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/db-hot/src/schema.ts` — `Opportunity` schema (prize_cash_inr, prize_text, audit_summary, bucket_channel, deadlines) and `TaskScratchpad` (STEP_1..STEP_4, partial_buffer) — Phase 4 writes audited opportunities and routes them
- `packages/db-hot/src/scratchpad.ts` — `getOrCreateScratchpad`, `advanceToStep2`, `recordFailure` (5 retries → tombstone), `resumeByUrl` — Phase 4's STEP machine resumes and advances through these
- `packages/llm/src/router.ts` — `LlmRouter.complete()` produces the auditor verdict consumed by the router service; bucket state streams to `agent_telemetry` for dashboard visibility
- `packages/scheduler/src/jobs.ts` — `runStubTick` pipeline (dedup precheck → Scout → scratchpad → fetch → STEP_2) is the skeleton Phase 4 replaces stub poll logic with real portal polling
- `packages/scout/src/index.ts` — `prefilter` expiry+spam gate runs before any fetch
- `packages/sanitize/src/index.ts` — `fetch` Jina-first + browser fallback, `MARKDOWN_CAP` 8k, links kept for 2-hop audit
- `packages/browser/src/index.ts` — `fetchViaBrowser`/`shutdown` shared singleton, max 2 concurrent tabs

### Established Patterns
- Jina-first strict fetch, browser fallback on fail signals only (Phase 2 D-01/D-02)
- Scout strict expiry + aggressive spam from title/snippet before any fetch (Phase 2 D-16–D-19)
- 8k capped markdown, links kept, media aborted (Phase 2 D-03/D-04/D-12)
- Max 2 tabs FIFO, fresh context per job, strict close discipline (Phase 2 D-08–D-15)
- Scratchpad STEP_1/STEP_2 in Phase 2; STEP_3/STEP_4 writers land Phase 3/4 (Phase 2 D-20, one-way)
- Bucket state in `agent_telemetry` via PB + SSE; 429/413 via vendor SDK errors; length-stitch router-level; Cerebras disabled (Phase 3)
- Single scheduler registry (kelektiv/node-cron, noOverlap + jitter, Asia/Kolkata); fail-fast zod env gate; tsc emit production (Phase 1)

### Integration Points
- Portal adapters → Scout prefilter (`packages/scout`) → sanitize fetch (`packages/sanitize`) → scratchpad STEP_2 (`packages/db-hot/scratchpad`) → LlmRouter auditor (`packages/llm/router`) → Link-Hopper 2-hop (before verdict) → opportunities `status='audited'` → Discord router service polls `status='audited'` + `bucket_channel` → posts embed → `status='routed'`
- `apps/bot/src/index.ts` is a skeleton with no discord.js gateway/intents/embeds/routing yet — the Discord router service and gateway wiring land in Phase 4; no `DISCORD_TOKEN` exists in `packages/config/src/env.ts` yet
- New cron jobs for the 7 portal polls must register through the single scheduler registry (no scattered `setInterval`)

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the locked decisions — open to standard approaches within the Phase 4 scope and Phase 1–3 contracts. User-selected concrete options for every discussed area (no "you decide" selections).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope creep raised; no todos folded (todo match count 0).

</deferred>

---

*Phase: 4-Events Vertical Slice*
*Context gathered: 2026-10-16*
