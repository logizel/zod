# Phase 5: Jobs + Loot Pipelines - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers the jobs vertical (fresher-true job alerts) and the loot vertical (verified free-perk diversions), plus the cross-portal dedup merger:

- **Jobs (ING-03, JOB-01..05):** Poll job sources every 30–60m via a hybrid broad mix (curated Greenhouse/Lever/Ashby public JSON boards + aggregators YC Work-at-a-Startup / Wellfound / Cutshort / Cuvette + HN "Who is hiring?" via Algolia API, and Workday via the shared headless browser), with a seed + auto-learn company-board list. Listing-stage title/text screen rejects obvious senior roles (zero fetch); survivors get a detail fetch and the auditor pass enforcing the fresher gate (Minimum≤1 experience rule, fellowship-allowlist unpaid rule, hard-reject scam set, India-eligible-wide geo gate) and routing: Systems/Cloud/DevOps/SRE/K8s/Rust-Go-C → #⚙️-jobs-sys-cloud-devops (JOB-04); other verified SWE → #💼-jobs-general-swe (JOB-05).
- **Loot (LOT-01..04):** Two entry paths — (1) divert: online events failing the ₹1L cash rule but carrying a real perk are loot-verified and routed to #🎁-free-swag-and-credits instead of REJECTED (LOT-01); (2) a curated vendor-program watchlist (CNCF/LF, AWS, Azure, GitHub Education, Oracle, and similar) polled at low cadence for cert-voucher/credit alerts (LOT-02, LOT-03), plus swag-drop detection from existing candidates (LOT-04). Verification is a deterministic prefilter + auditor read of the official rules/FAQ page (within the 2-hop Link-Hopper cap): hard-reject US/EU-only shipping, flag credit-card requirements, extract exact claim steps with a cited quote.
- **Dedup merger (EVT-07):** High-confidence cross-portal duplicates auto-merge (events: normalized title + ±3d date + organizer; jobs: company + role title + location) into one alert with a union of registration/apply links; weaker matches are flagged but never merged. Merge runs pre-audit; late duplicates only append links to the master, never re-post.

**Also required for Phase 5 to be end-to-end:** the shared audit orchestrator + live dependency wiring. Phase 4 shipped all module pieces and the Discord router, but its tracer injected the auditor verdict at test time — no production code assembles auditor prompts, calls `LlmRouter.complete()`, or writes `opportunities` rows with `status='audited'` + `bucket_channel`, and the scheduler's live tick does not inject its PB/cold/candidate deps. Jobs/loot success criteria cannot be met without this shared STEP_2 → gates → auditor → opportunity-write path, so landing it (completing the events path too) is inside this phase's boundary. Structure is the planner's call (research ARCHITECTURE prescribes one Deep-Auditor with per-pipeline rule packs).

Scope anchors: "Users get fresher-true job alerts and verified free-perk diversions with duplicates merged and scams rejected." New capabilities beyond jobs/loot/dedup/orchestrator belong in later phases.

</domain>

<decisions>
## Implementation Decisions

### Job sources & polling (ING-03)
- **D-01:** Hybrid broad source mix — curated Greenhouse/Lever/Ashby public JSON boards + aggregators (YC Work-at-a-Startup, Wellfound, Cutshort, Cuvette) + HN "Who is hiring?" monthly thread via the free Algolia API. All listing-level candidates pass Scout + dedup gates before any detail fetch or LLM spend. — **Reversibility:** reversible — adding/removing a source adapter + its cron entry is local; user explicitly asked for broader sourcing ("use other sites like yc startups hackernews etc etc also").
- **D-02:** Seed + auto-learn company-board list — a static operator seed list in config; when an aggregator/HN listing cross-links to an ATS board (boards.greenhouse.io/acme, jobs.lever.co/acme, jobs.ashbyhq.com/acme), the system auto-adds that board to the poll rotation (deny-list for junk boards later). — **Reversibility:** reversible — learned boards are prunable rotation state; seed list is config.
- **D-03:** Workday ships in Phase 5, fetched via the shared headless browser (user chose include over defer). Workday is JS-walled and shares the 2–3 tab browser budget with the 5 scrape-mode event portals — poll staggering must account for it. — **Reversibility:** reversible — dropping the adapter returns its browser-budget share; no contract change.
- **D-04:** Listing-stage title+text screen rejects unambiguous senior markers before any fetch: 'Senior/Staff/Principal/Lead/Manager/Director' in title, '3+/5+ years' strings in snippet. Borderline titles (Engineer II, SDE-2, '0–3 yrs') still get fetched and audited. — **Reversibility:** reversible — predicate change; risk is bounded to fetch/LLM savings.

### Fresher/scam gates (JOB-01..03)
- **D-05:** Minimum≤1 experience rule — reject only when the stated minimum is 2+ years ('2+ years', '2–5 yrs', 'minimum 2 years'); admit ranges whose minimum is ≤1 ('0–2 years', 'up to 2 years', 'fresher', '0–1'); unstated experience is admitted to audit (most fresher posts omit it). The auditor still reads full text for scam signals. — **Reversibility:** reversible — gate predicate change; matches JOB-03's literal "reject 2+yr roles" wording.
- **D-06:** Fellowship allowlist for unpaid roles — any listing stating 'unpaid' rejects unless it matches a known structured-fellowship allowlist (LFX, GSoC, MLH, and similar program names kept in config). Reason code: `unpaid_non_fellowship`. — **Reversibility:** reversible — allowlist is config; new programs appended as they appear.
- **D-07:** Hard-reject scam set, logged-not-alerted, with reason codes — training/certification fees, registration/deposit charges, pay-to-join, Telegram/WhatsApp-only application, missing company identity/domain, 'earn ₹X/day' spam patterns. Listing-stage detectors pre-flag cheaply; the auditor confirms from full text during its pass. — **Reversibility:** reversible — detector sets are code+config; applies going forward only.
- **D-08:** India-eligible-wide geo gate — admit India on-site/hybrid, 'Remote — India', and global 'Remote — Worldwide/Anywhere'; reject geo-locked remote (US-only, EMEA-only) and work-authorization-required language. Location metadata checked at listing stage; the auditor confirms visa/geo constraints from full text. — **Reversibility:** reversible — predicate change; JOB-01's contract preserved.

### Duplicate merger (EVT-07)
- **D-09:** High-confidence auto-merge only — merge when normalized-title similarity is high (≥ ~0.9, initial value) AND ±3-day date window AND organizer/company match; first-seen row is master with a union of registration/apply links. Weaker similarity pairs are flagged 'possible dupe' on the record but never merged. Threshold stays tunable via a later labeled eval (research guardrail: no medium-threshold auto-merge without one). — **Reversibility:** costly — a false merge permanently blends fields and the tombstoned duplicate is never deleted; undoing policy does not undo data. Rationale: satisfies roadmap criterion #5 ("one merged alert with unified registration links") while capping Pitfall 7 risk.
- **D-10:** Pre-audit merge stage — the merger runs before the auditor: a new sighting matching a pre-audit master folds in (links unioned, no second audit); if the master is already audited/routed, a late duplicate only appends its link to the master record and never re-posts. — **Reversibility:** costly — moving the stage later reworks pipeline ordering, dedup precheck wiring, and audit flow/tests.
- **D-11:** Merger scope is events + jobs (events: title + ±3d + organizer; jobs: company + role title + location fuzzy keys). Loot stays out — loot items are rarely true duplicates. — **Reversibility:** reversible — a loot key set can be added later without touching the existing two.

### Loot pipeline (LOT-01..04)
- **D-12:** Divert + curated vendor watchlist — path 1 diverts perk-carrying events that fail the ₹1L rule; path 2 polls a small curated watchlist of vendor program pages (CNCF/LF, AWS, Azure, GitHub Education, Oracle, and similar) at low cadence (e.g., 4–6h, not binding) for credit/voucher alerts, plus swag-drop detection from existing event/loot candidates. — **Reversibility:** reversible — source list + cadence are config/registry entries.
- **D-13:** Loot verification depth = deterministic prefilter + auditor FAQ read — keyword layer flags credit-card-required language, shipping-region terms, and expiry signals from the listing; then the auditor reads the official rules/FAQ page (within the existing 2-hop Link-Hopper cap) and produces: shipping evidence (India/global vs US/EU-only hard reject per LOT-04), card-required flag (LOT-02), and exact claim steps extracted with a cited quote (LOT-03). — **Reversibility:** reversible — contained in the loot audit path + prompt contract.

### Data contract (jobs + loot fields)
- **D-14:** Extend the locked `Opportunity` schema via a documented one-way migration (the Phase 1 acknowledged pattern) with nullable fields — jobs: experience span, stack/domain tags, eligibility summary; loot: `shipping_verified`, `card_required`, `claim_steps`. Migration coordinates with the infra plan (PB collection update + `INDEX_NOTES`). — **Reversibility:** one-way — the five-collection schema is a locked contract with existing data; undo requires another migration, and `INDEX_NOTES`/infra coordination follows the collection shape.

### the agent's Discretion
No "you decide" selections — the user chose a concrete option in every discussed area. Researcher/planner have flexibility on: lock-file similarity algorithm details (title normalization, company aliases, numeric threshold ≥0.9 is the locked initial), how diverted loot (reusing the events audit + limited addendum) vs watchlist loot (fresh loot pass) share the audit ladder, loot card format, exact vendor-watchlist contents + cadence (4–6h is an example, not binding), swag-drop detection mechanics, the Sys/Cloud vs General SWE routing classifier's mechanics (JOB-04's stack list is the anchor), channel naming + ID-vs-name resolution for the three new channels, poll staggering within 30–60m, per-adapter parser shapes (Greenhouse/Lever/Ashby JSON, HN Algolia, Workday headless path), scam-detector implementation (locked classes only), where auto-learned board state persists, rejection-persistence mechanics (logged-not-alerted contract), and the shared audit orchestrator's structure (must land end-to-end; research ARCHITECTURE prescribes one Deep-Auditor with per-pipeline rule packs).

### Folded Todos
None — no todos matched Phase 5 in cross_reference_todos (todo_count 0).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase goal & requirements
- `.planning/ROADMAP.md` §Phase 5 — goal ("fresher-true job alerts and verified free-perk diversions with duplicates merged and scams rejected"), requirements ING-03/EVT-07/JOB-01..05/LOT-01..04, success criteria 1–5
- `.planning/REQUIREMENTS.md` — ING-03 (job portals 30–60m), EVT-07 (cross-platform dup merge), JOB-01..05 (India eligibility, fresher admission, scam reject, Sys/Cloud routing, General SWE routing), LOT-01..04 (divert gate, card flag, cert vouchers, shipping verification) + Traceability Phase 5 rows
- `.planning/PROJECT.md` — Core Value, Constraints (zero cost, prize/India-shipping rules, 2–3 tab browser, poll cadences), Context (job portal list incl. Workday)

### Prior phase decisions (carry forward, respected)
- `.planning/phases/04-events-vertical-slice/04-CONTEXT.md` — D-01..D-11: listing-first adapters (title+snippet, zero fetch), staggered polls, Link-Hopper 2-hop via HTTP redirects before verdict, tombstone `link_hop_failed`, dedicated Discord router as single writer, audit-card embed, prize-gate predicate, 80/20 pre-filter ordering
- `.planning/phases/03-llm-swarm/03-CONTEXT.md` — D-01..D-04: bucket-state persistence via `agent_telemetry`, vendor-SDK 429/413 detection, router-level length-stitch, Cerebras omitted
- `.planning/phases/02-scraper-foundation/02-CONTEXT.md` — D-01..D-23: Jina-first fetch, 8k cap, Scout strict expiry + aggressive spam (precision bias), scratchpad resume-by-URL, 5-retry tombstone
- `.planning/phases/01-foundation/01-CONTEXT.md` — five-collection schema lock (one-way migration acknowledgment), fingerprint two-tier precheck, single scheduler registry

### Research (phase 0 outputs — still authoritative)
- `.planning/research/SUMMARY.md` §Phase 5 — deliverables (ATS JSON-first, experience-span + scam screen with hard REJECTs logged-not-alerted, loot checklist + divert thresholds, fuzzy-merger labeled-eval gate) + research flag: ATS JSON endpoint shapes per board; loot claim-form/FAQ hop patterns
- `.planning/research/PITFALLS.md` — Pitfall 7 (fuzzy false merges; auto-merge below 0.9 forbidden; flag-don't-merge until eval), Pitfall 9 (seniority false PASS/REJECT), Pitfall 10 (shipping/loot misses), ATS gotcha (JSON endpoints first, headless only for Workday-type walls)
- `.planning/research/FEATURES.md` — ATS polling row (Greenhouse/Lever/Ashby public Boards APIs; 30–60m), experience/eligibility verification row, trash-to-treasure divert row, US/EU-only swag anti-feature
- `.planning/research/ARCHITECTURE.md` — Link-Hopper resolves to official/ATS; Deep-Auditor + Chief Curator apply rule packs (event/job/loot) with JSON verdicts

### Data contracts & pipeline code (reuse points)
- `packages/db-hot/src/schema.ts` — `Opportunity` (+ fields extended per D-14), `PIPELINES` (jobs/loot), `OPPORTUNITY_STATUSES`, `INDEX_NOTES` (infra plan consumes)
- `packages/dedup/src/fingerprint.ts` + `precheck.ts` — exact-hash two-tier precheck; the fuzzy merger (D-09..D-11) extends this layer, not replaces it
- `packages/llm/src/router.ts` — `LlmRouter.complete()` (step1/step2 baton-pass, stitch, priority lanes, `CompleteOptions.pipeline` already pipeline-aware)
- `packages/discord-router/src/portals/` — 7 event adapter `list() → PollCandidate[]` contract to mirror for job/loot sources
- `packages/discord-router/src/link-hop.ts`, `prize-gate.ts`, `embed.ts`, `router-service.ts` — hop resolution, eligibility-predicate pattern, audit-card builder, audited→routed poll loop
- `packages/scheduler/src/jobs.ts` + `registry.ts` — `STUB_JOBS` (jobs-stub 45m + jitter exists), `PORTAL_LIST_FNS` pattern, single-registry rule (no `setInterval`)
- `packages/scout/src/` — `prefilter` (expiry + spam, zero fetch) to run on job listings
- `packages/config/src/env.ts` — fail-fast zod env gate (new keys land here first)

### Runtime/stack
- AGENTS.md (project root) — Technology Stack + Constraints sections

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/discord-router/src/portals/` — adapter contract `list(): Promise<PollCandidate[]>` emitting `{url, title, snippet}` only; job sources (Greenhouse/Lever/Ashby JSON, HN Algolia, Workday headless) and the loot vendor watchlist follow this exact shape
- `packages/scheduler/src/jobs.ts` — `runStubTick`/`runPollTick` pipeline (dedup precheck → Scout prefilter → scratchpad resume → fetch → STEP_2) is the insertion point for job/loot candidates; `jobs-stub` cron entry already exists at the right cadence
- `packages/discord-router/src/link-hop.ts` — `resolveOfficialDomain(url, maxHops=2)` with SSRF guard; the loot FAQ read and ATS-resolution hops reuse it within the 2-hop cap
- `packages/discord-router/src/prize-gate.ts` — deterministic eligibility-predicate pattern to mirror for the fresher gate (Minimum≤1, fellowship allowlist, scam classes) instead of inventing a new structure
- `packages/discord-router/src/router-service.ts` + `embed.ts` — audited→routed poll loop and embed builder; jobs/loot cards reuse `buildAuditCard`'s field approach (new per-pipeline field sets per D-14)
- `packages/llm/src/router.ts` — `CompleteOptions` already carries `pipeline` + `slot` + priority (`Curator>Auditor>Scout`); audit prompts/rule packs plug in here
- `packages/db-hot/src/scratchpad.ts` — STEP_1..STEP_4 enum exists; writers currently reach STEP_2
- `packages/dedup/src/` — `fingerprint`/`hashUrl`/`normalizeUrl`/`precheck`; the fuzzy merger layer builds on these

### Established Patterns
- listing-first (title+snippet) with zero-fetch pre-filters; detail fetch only for survivors (Phase 4 D-03)
- Single scheduler registry owns every cron (noOverlap + maxRandomDelay + Asia/Kolkata); no `setInterval` anywhere
- zod `Schema.parse()` at every boundary, loud on mismatch; fail-fast env gate first in every entrypoint
- Tombstone terminal statuses (`scout_rejected`, `link_hop_failed`, `discord_post_failed`, `unpaid_non_fellowship`-style reason codes) are never deleted — cold ledger + hot mirror
- PB hot (writers) + Turso cold (tombstones/taste) split; bucket telemetry via `agent_telemetry`

### Integration Points
- **Missing middle (must land in Phase 5):** no production caller assembles auditor prompts, calls `LlmRouter.complete()`, or writes `opportunities` rows (`status='audited'`, `bucket_channel`, `audit_summary`); `registerStubJobs` currently injects no pb/hot/cold/candidates — the shared orchestrator + live wiring (events/jobs/loot rule packs) completes the pipeline end-to-end
- New channels to resolve: `#⚙️-jobs-sys-cloud-devops`, `#💼-jobs-general-swe`, `#🎁-free-swag-and-credits` — `resolveChannel` matches by ID or exact name; naming contract for new `bucket_channel` values needs one convention
- New cron jobs (job source polls, vendor watchlist poll, merge stage within poll ticks) register through `packages/scheduler/src/registry.ts` only
- Schema migration (D-14) coordinates with the infra plan: PB collection update + `INDEX_NOTES`; env keys (if any new API creds) land in `packages/config/src/env.ts` first
- Workday + scraped aggregators share the 2-tab FIFO browser queue with 5 event portals — staggering math must account for total tab pressure (OPS-01 budget)
- ATS JSON detail fetches arrive pre-sanitized (JSON, not HTML) — decide per-adapter whether they bypass Jina/browser and feed the auditor directly (cheaper) while keeping the 8k cap discipline

</code_context>

<specifics>
## Specific Ideas

- User explicitly requested broader job sourcing beyond the enumerated portals: "use other sites like yc startups hackernews etc etc also" — folded into D-01 (YC, HN Who-is-hiring via Algolia, plus hybrid ATS boards)
- Workday explicitly wanted in Phase 5 despite headless cost (D-03)
- Merge threshold starts at ≥~0.9 with a later labeled-eval tuning path (D-09); research warns medium-threshold auto-merge is forbidden until that eval passes

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The broad-community loot feed option (HN/dev.to free-stuff tip-offs) was considered and not selected; loot scope stays divert + curated vendor watchlist for now. No todos folded (todo count 0).

</deferred>

---

*Phase: 5-Jobs + Loot Pipelines*
*Context gathered: 2026-10-16*
