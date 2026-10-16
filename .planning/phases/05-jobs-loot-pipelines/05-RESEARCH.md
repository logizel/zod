# Phase 5: Jobs + Loot Pipelines - Research

**Researched:** 2026-10-16
**Domain:** Hybrid job-source ingestion (ATS JSON + aggregators + HN Algolia + Workday) · fresher/scam/geo audit gates · loot divert + vendor watchlist verification · pre-audit fuzzy cross-portal merger · shared audit orchestrator + live scheduler wiring (TypeScript, Node 22+, pnpm workspaces)
**Confidence:** HIGH for in-repo architecture (read directly); MEDIUM for ATS/API shapes (Context7/official docs); LOW for aggregator accessibility + vendor-program details (web search only — see Assumptions Log)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. The broad-community loot feed option (HN/dev.to free-stuff tip-offs) was considered and not selected; loot scope stays divert + curated vendor watchlist for now. No todos folded (todo count 0).

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-03 | Poll job/fellowship portals (Greenhouse, Lever, Ashby, YC, Wellfound, Cutshort, Cuvette, LFX/GSoC/MLH) via search-index + direct polling every 30–60 minutes | Verified free JSON endpoints for Greenhouse/Lever/Ashby; HN Algolia recipe; Workday CXS listing (refines D-03); aggregator accessibility findings + `startup.jobs` alternate; poll registration via the single scheduler registry (existing `jobs-stub` at 45m becomes the real tick) |
| EVT-07 | Cross-platform duplicates merge on normalized title + ±3d date window + organizer into one master record with unified `registration_links[]` | Two-tier precheck extended by a bounded fuzzy merger; `string-similarity-js` (audited) at ≥0.9 Dice + ±3d + org/company; pre-audit stage per D-10; flag-don't-merge below threshold per Pitfall 7 |
| JOB-01 | Admit India on-site/hybrid roles plus India-eligible global remote roles | Geo gate predicate (listing metadata + auditor full-text confirm); ATS `location`/`country` fields verified at listing time |
| JOB-02 | Deep-Auditor admits internships, 6-month PPOs, new-grad, off-campus, LFX/GSoC fellowships, and 0–1yr entry roles from full requirements text | Rule-pack prompt via `LlmRouter.complete()` (`pipeline: 'jobs'`); JSON verdict contract per pipeline; orchestrator lands the missing STEP_2→audit path |
| JOB-03 | Reject 2+yr roles, unpaid non-fellowships, and pay-for-training/certificate scams | Minimum≤1 gate (D-05) + fellowship allowlist (D-06) + scam detector set (D-07) with reason codes; tombstoned logged-not-alerted via cold ledger |
| JOB-04 | Systems/Cloud/DevOps/SRE/K8s/Rust-Go-C roles route to #⚙️-jobs-sys-cloud-devops with stack + ATS link | Stack-tag classifier in the auditor verdict + `bucket_channel` write; verify/name resolution of the new channel |
| JOB-05 | Other verified SWE roles route to #💼-jobs-general-swe with eligibility + direct apply link | Default job bucket when JOB-04 stack set absent; eligibility from D-14 fields; apply link from ATS `absolute_url`/`applyUrl` |
| LOT-01 | Online events failing the ₹1L cash rule are checked for free-perk diversion to #🎁-free-swag-and-credits before REJECTED | `passesPrizeGate` fail path is the divert trigger; loot eligibility predicate mirrors prize-gate structure; divert happens at audit verdict, not at gate |
| LOT-02 | Cloud/AI credit alerts flag credit-card requirement for verification | Deterministic keyword prefilter + auditor verdict field `card_required` (D-14) |
| LOT-03 | Certification voucher alerts cover 100%-free exams (CNCF/LF, AWS, Azure, GitHub, Oracle) with exact claim steps | Curated vendor watchlist adapters + auditor FAQ read (2-hop cap) extracting claim steps with cited quote |
| LOT-04 | Physical swag alerts verify global-or-India shipping from official rules/FAQ and reject US/EU-only drops | Auditor shipping-evidence field (`shipping_verified`); US/EU-only hard reject; claim forms/FAQs hide the region — the FAQ read is mandatory |

</phase_requirements>

## Summary

Phase 5 has four interlocking workstreams: (1) the **jobs vertical** — hybrid source polling, a zero-fetch listing screen, fresher/scam/geo audit gates, and stack-based routing into two new channels; (2) the **loot vertical** — divert of perk-carrying events that fail the ₹1L rule, plus a curated vendor watchlist with FAQ-level verification; (3) the **cross-portal merger** — high-confidence fuzzy dedup extended from the existing exact-hash layer; and (4) the **missing audit middle** — no production code currently assembles auditor prompts, calls `LlmRouter.complete()`, or writes `opportunities` rows with `status='audited'`. Verified this session: the only `.complete()` references in `packages/*/src` are inside `packages/llm/src/router.ts` itself; `startRegistry` passes only `{ sink, heartbeatDir }` into `registerStubJobs`, and `runStubTick` warns `'poll deps not provided; skipping candidate processing'` ([VERIFIED: packages/scheduler/src/jobs.ts:319-321]) when pb/hot/cold are absent. Jobs/loot success criteria cannot be met without landing this shared orchestrator, so it is inside this phase's boundary (CONTEXT confirms).

The single most valuable research finding: **the jobs layer is JSON-first end to end**. Greenhouse, Lever, and Ashby all expose free, unauthenticated public JSON that carries title, location, and full description text in one request ([CITED: context7 /grnhse/greenhouse-api-docs], [CITED: github.com/lever/postings-api], [CITED: context7 /llmstxt/developers_ashbyhq_llms_txt]); the HN "Who is hiring?" thread is fully readable through the free Algolia API ([CITED: hn.algolia.com/api]); and Workday — the one source CONTEXT assumed needs the headless browser — appears to expose a public listing JSON through its `cxs` endpoint, meaning the shared browser is only needed for detail pages that render client-side ([ASSUMED] — web-verified, low confidence; see A1). Aggregators are the fragile part: YC Work-at-a-Startup and Wellfound are login-walled, Cutshort listing pages are server-rendered, and Cuvette is only indirectly evidenced ([ASSUMED] — A2–A4).

A second structural finding: **the workspace dependency graph forbids putting the orchestrator inside `packages/scheduler`**. `packages/llm` already depends on `@zod/scheduler-registry` ([VERIFIED: packages/llm/package.json:22] — `"@zod/scheduler-registry": "workspace:*",`), so `scheduler → orchestrator → llm → scheduler` would be a build-order cycle. The established, cycle-free pattern already exists in the repo: `runGatewayTick` delegates to an injected `tickHandler` provided by the LLM package (`registry-integration.ts` line 66: `this.handle = registerGatewayJobs(log, mod, { tickHandler });` [VERIFIED: packages/llm/src/registry-integration.ts:66]). The orchestrator should ship as its own package and register its drain job the same way.

**Primary recommendation:** Build `@zod/orchestrator` (new package) owning STEP_2 → per-pipeline rule pack → `LlmRouter.complete()` → deterministic gates → `opportunities`/tombstone writes, registered as a scheduler `tickHandler` (GatewayScheduler pattern). Implement job sources as listing-first adapters mirroring the `portals/*` contract with direct ATS JSON fetches (no Jina/browser for JSON); extend `@zod/dedup` with a bounded pre-audit merger (≥0.9 Dice + ±3d + org/company; flag below); drive loot through the `passesPrizeGate` fail path plus a vendor watchlist; register every new cron entry in the single scheduler table; and wire live deps (pb/hot/cold/candidates) into the app entrypoint. One optional new dependency: `string-similarity-js` (audited — Package Legitimacy Audit below) for the fuzzy merger.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Job source listing (ATS JSON, HN Algolia, Cutshort/Cuvette, Workday) | Ingest adapters (Node scheduler process) | External APIs (Greenhouse/Lever/Ashby/HN/Workday) | Listing-first, zero-fetch contract mirrors `portals/*` `list() → PollCandidate[]`; adapter-side pagination only |
| Senior-marker listing screen (D-04) | Pure predicate library | — | Zero-fetch, unit-testable like `@zod/scout` prefilter |
| Detail fetch (ATS JSON vs Jina vs browser) | Fetch layer (`@zod/sanitize` facade) | ATS JSON direct path (bypass); shared browser (Workday/aggregators) | JSON arrives pre-sanitized; browser budget is 2–3 tabs shared with 5 event portals |
| Fresher/scam/geo audit (JOB-01..03) | LLM tier via orchestrator rule packs | Deterministic gates as final reject authority | ARCHITECTURE prescribes one Deep-Auditor, per-pipeline rule packs; gates keep LLM fallible |
| Stack routing (JOB-04/05) | Auditor verdict field + orchestrator write | — | `bucket_channel` is set at opportunity write; router-service already routes `status='audited'` rows |
| Cross-portal merge (EVT-07) | `@zod/dedup` merger (pre-audit stage) | Hot fingerprint + cold ledger | Extends the two-tier precheck; no new storage tier |
| Loot divert + vendor watchlist (LOT-01..04) | Scheduler adapters + loot predicate | Auditor FAQ read via `link-hop` (2-hop cap) | Divert decision at audit verdict; watchlist poll is just another listing adapter |
| Opportunity persistence | Hot DB (PocketBase) | Cold ledger (Turso tombstones) | Writers → PB; terminal rejects → tombstone (logged-not-alerted) |
| Routing to Discord | `router-service` poll loop (existing) | — | `status='audited' && bucket_channel != ''` loop already ships; new channels need name resolution |
| Audit orchestration | New `@zod/orchestrator` package | Registered via scheduler `tickHandler` | Cycle-free per the GatewayScheduler precedent (`llm → scheduler-registry` edge already exists) |

## Standard Stack

### Core (carry-forward — already in the workspace; no new installs except the fuzzy lib)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@zod/scheduler-registry` (`node-cron`) | `node-cron ^4.6.0` | Single cron registry for all new poll/watchlist/audit-drain jobs | [VERIFIED: packages/scheduler/package.json:23]; registry owns every `schedule()` ([VERIFIED: packages/scheduler/src/registry.ts:125-158]); `noOverlap` + `maxRandomDelay` = 10 * 60_000 for `jobs-stub` already defined ([VERIFIED: packages/scheduler/src/jobs.ts:76-81]) |
| `@zod/dedup` | workspace | `fingerprint`/`normalizeUrl`/`hashUrl` + two-tier `precheck`; the merger extends this | [VERIFIED: packages/dedup/package.json:22-24]; verdict enum `'fresh' \| 'hot-hit' \| 'tombstoned'` ([VERIFIED: packages/dedup/src/precheck.ts:15]) |
| `@zod/llm` (`LlmRouter`) | workspace (`groq-sdk ^1.6.0`, `openai ^4.85.0`) | Audit completions; baton-pass on 429/413; priority lane | [VERIFIED: packages/llm/package.json:23-24]; `CompleteOptions` already pipeline-aware ([VERIFIED: packages/llm/src/router.ts:30-38]) |
| `@zod/db-hot` (PocketBase `^0.28.1`) | workspace | `opportunities` + `task_scratchpad` + `tombstone_ledger` writes | [VERIFIED: packages/db-hot/package.json:33]; `advanceToStep2` slices to 8000 chars ([VERIFIED: packages/db-hot/src/scratchpad.ts:77-80]) |
| `@zod/db-cold` (`@libsql/client`) | workspace | Cold tombstone ledger (immortal rejects) | `INSERT OR IGNORE` single statement ([VERIFIED: packages/db-cold/src/client.ts:31-32]) |
| `@zod/sanitize` | workspace | Fetch facade Jina→browser, SSRF `validateUrl`, 8k discipline | [VERIFIED: packages/sanitize/src/fetch.ts:61-86] |
| `@zod/scout` | workspace | Zero-fetch prefilter (expiry + spam) on job listings | [VERIFIED: packages/scout/src/index.ts:19-29] |
| `@zod/discord-router` | workspace (`discord.js ^14.25.1`, `cheerio ^1.2.0`) | Adapter contract, `resolveOfficialDomain` (2-hop), `passesPrizeGate`, `buildAuditCard`, `router-service` loop | [VERIFIED: packages/discord-router/package.json:23-24, 13-16] |
| `zod` | `^4.6.7` | Boundary validation for every ATS/aggregator payload + LLM verdict | [VERIFIED: packages/db-hot/package.json:34] |
| `vitest` | `^3.2.7` | Unit/integration tests (root workspace config) | [VERIFIED: package.json:19]; [VERIFIED: vitest.config.ts:4-7] |

### Supporting (new — one candidate)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `string-similarity-js` | `2.1.4` | Dice bigram coefficient for normalized-title similarity in the merger | Recommended. Successor semantics to the deprecated `string-similarity`; returns `[0,1]` which matches D-09's `≥ ~0.9` threshold directly. [ASSUMED: name discovered via web search; legitimacy gate OK] |
| `fastest-levenshtein` | `1.0.16` | Alternate: raw edit distance (normalize to `[0,1]` yourself) | Only if a dependency decision favors the smaller, fastest distance function; requires manual `1 - d/maxLen` normalization and is length-sensitive on titles. [ASSUMED] |
| `fast-fuzzy` | latest | Fuller fuzzy matcher (Sørensen–Dice built in) | If the merger later needs abbreviation/fuzzy-search features beyond one score; heavier than needed for D-09. [ASSUMED] |

**Explicitly avoid:** `string-similarity` (original npm package) — formally deprecated, "Package no longer supported", inactive ~5 years [VERIFIED: npm registry probe this session]. The phase-0 STACK.md listed it; this research supersedes that row.

**Installation:**
```bash
pnpm add string-similarity-js --filter @zod/dedup
```

**Version verification:** `fastest-levenshtein@1.0.16` published 2022-08-02 (26,291,409 downloads/wk); `string-similarity-js@2.1.4` published 2021-08-07 (181,196/wk); `fast-fuzzy` published 2022-11-05 (1,678,695/wk) — all confirmed via `package-legitimacy check` this session. None installed in the repo yet. ATS APIs verified via Context7/official docs this session (Greenhouse/Lever/Ashby shapes quoted in Code Examples).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ATS public JSON | HTML scraping of board pages | JSON is 1 request, no browser, stable fields — HTML scraping burns the tab budget and breaks on layout changes. Never scrape where JSON exists |
| Workday headless browser (D-03) | `cxs` JSON POST listing | JSON POST avoids a browser tab for listing; browser stays as fallback/detail renderer — refines D-03 without dropping it [ASSUMED: A1] |
| `string-similarity-js` | Hand-rolled Dice/Levenshtein | Hand-rolling is a Don't-Hand-Roll item (edge cases, normalization); the lib is 3KB and audited |
| Aggregator scraping (YC/Wellfound) | Seed + auto-learn ATS boards; `startup.jobs` free API + RSS | Login walls + ToS risk vs. structured ATS coverage; auto-learn harvests the useful part of aggregators without scraping them [ASSUMED: A3/A4] |
| Per-source cron entries | One grouped jobs tick | Registry supports both; per-source stagger (like the 7 event portals) matches existing convention and spreads tab pressure [VERIFIED: packages/scheduler/src/jobs.ts:94-138] |

## Package Legitimacy Audit

> Run this session via `gsd-tools query package-legitimacy check --ecosystem npm` — verdicts below are tool output.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `string-similarity-js` | npm | published 2021-08-07 (~5 yrs) | 181,196/wk | github.com/stephenjjbrown/string-similarity-js | OK | Approved — recommended merger lib |
| `fastest-levenshtein` | npm | published 2022-08-02 (~4 yrs) | 26,291,409/wk | github.com/ka-weihe/fastest-levenshtein | OK | Approved — alternate |
| `fast-fuzzy` | npm | published 2022-11-05 (~4 yrs) | 1,678,695/wk | github.com/EthanRutherford/fast-fuzzy | OK | Approved — fallback if merge needs grow |
| `string-similarity` | npm | inactive ~5 yrs | ~1.2M/wk (legacy) | (original) | Deprecated | REMOVED — do not install (phase-0 STACK.md row superseded) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*All three candidates were discovered via web search, so their *names* carry `[ASSUMED]` provenance and must not be tagged `[VERIFIED]` — but the legitimacy gate returned `OK` for all three this session, so installation may proceed normally. The *choice among them* is discretionary per CONTEXT (similarity algorithm details are the agent's discretion). No new dependencies are required for any other part of this phase: everything else is an already-installed workspace package.*

## Architecture Patterns

### System Architecture Diagram

```
        ┌────────────────────────── Scheduler process (single registry, Asia/Kolkata) ─────────────────────────┐
        │  portal-* (events, existing 7)   jobs-* (NEW adapters)   loot-watchlist (NEW, low cadence)          │
        │  audit-drain (NEW orchestrator tickHandler, GatewayScheduler pattern)                                 │
        └───────┬──────────────────────────────┬──────────────────────────┬────────────────────────────────────┘
                │                              │                          │
                ▼                              ▼                          ▼
    Events: portals/* list()      Jobs: ATS JSON (GH/Lever/Ashby)   Loot: vendor pages + diverted events
    (existing Phase 4)            HN Algolia · Cutshort/Cuvette      (from prize-gate fail path)
                                  Workday cxs JSON → browser fallback
                │                              │                          │
                └──────────────┬───────────────┴──────────────────────────┘
                               ▼
                  PollCandidate[] {url, title, snippet}          ← adapter contract (unchanged)
                               ▼
            ┌──────────────────────────────────────────┐
            │ 1. Dedup two-tier precheck               │   hot fingerprint → cold url_hash
            │    + NEW fuzzy merger (pre-audit, D-10)  │   ≥0.9 Dice + ±3d + org/company → union links
            │    hot-hit/tombstoned/merged → skip      │   below threshold → 'possible dupe' flag only
            └───────────────────┬──────────────────────┘
                                ▼
            ┌──────────────────────────────────────────┐
            │ 2. Scout prefilter (expiry/spam)         │   zero fetch
            │    + NEW job listing screen (D-04)       │   unambiguous senior markers → reject (0 fetch)
            └───────────────────┬──────────────────────┘
                                ▼
            ┌──────────────────────────────────────────┐
            │ 3. Fetch → STEP_1 → STEP_2               │   ATS JSON direct | Jina | browser (budgeted)
            │    scratchpad resume-by-URL, 8k cap      │
            └───────────────────┬──────────────────────┘
                                ▼
            ┌──────────────────────────────────────────┐
            │ 4. ORCHESTRATOR (NEW — the missing middle)│   drain STEP_2 rows
            │    rule pack per pipeline → LLM verdict  │   LlmRouter.complete({pipeline, slot, priority})
            │    JSON verdict: fields + reason codes   │   events | jobs | loot rule packs
            └───────────────────┬──────────────────────┘
                                ▼
            ┌──────────────────────────────────────────┐
            │ 5. Deterministic gates (final authority) │   prize-gate | fresher gate | scam set | geo
            │    reject → tombstone (logged, no alert) │   loot divert → #🎁-free-swag-and-credits
            │    pass → bucket_channel assignment      │   jobs split: sys/cloud vs general SWE
            └───────────────────┬──────────────────────┘
                                ▼
            ┌──────────────────────────────────────────┐
            │ 6. PB write: opportunities status=       │   + tombstone_ledger (cold) for rejects
            │    'audited' + bucket_channel            │
            └───────────────────┬──────────────────────┘
                                ▼
            ┌──────────────────────────────────────────┐
            │ 7. router-service poll (existing)        │   status='audited' && bucket_channel != ''
            │    embed → Discord → status='routed'     │   new channels resolved by name/ID
            └──────────────────────────────────────────┘
```

### Recommended Project Structure

```
packages/
├── orchestrator/                      # NEW package @zod/orchestrator
│   └── src/
│       ├── orchestrator.ts            # drain STEP_2 scratchpad rows → audit → gates → PB write
│       ├── rule-packs/{events,jobs,loot}.ts   # prompt builder + zod verdict schema per pipeline
│       ├── gates/jobs.ts              # fresher (D-05), fellowship (D-06), scam (D-07), geo (D-08)
│       ├── gates/loot.ts              # divert predicate, card-required, shipping (LOT-01..04)
│       └── integration.ts             # GatewayScheduler-style tickHandler registration
├── dedup/src/merger.ts                # NEW — bounded fuzzy merge stage (extends precheck)
├── discord-router/src/portals/jobs/   # NEW adapters (same list() contract as portals/*)
│   ├── greenhouse.ts  lever.ts  ashby.ts  hn-whoshiring.ts
│   ├── cutshort.ts  cuvette.ts  workday.ts
│   └── boards.ts                      # seed list + auto-learn rotation state (D-02)
├── discord-router/src/portals/loot/   # NEW — vendor watchlist adapter(s)
├── scheduler/src/jobs.ts              # MODIFY — add jobs-*/loot-watchlist/audit-drain entries to the table
└── apps/scheduler/src/registry-start.ts  # MODIFY — inject pb/hot/cold/candidates + orchestrator deps
```

*(Exact package split is the planner's call per CONTEXT discretion; the constraint that matters is the dependency direction below.)*

### Pattern 1: Cycle-free orchestrator registration (the GatewayScheduler precedent)

**What:** The audit orchestrator must not be imported by `packages/scheduler` — `packages/llm` already depends on `@zod/scheduler-registry` ([VERIFIED: packages/llm/package.json:22]), so `scheduler → orchestrator → llm → scheduler` is a TypeScript project-reference cycle. Register the orchestrator's drain job through the same injected-`tickHandler` pattern the LLM gateway already uses.

**When to use:** For the `audit-drain` job (and any future pipeline stage that depends on `@zod/llm`).

**Example:**
```typescript
// Source: packages/llm/src/registry-integration.ts:52-67 (existing pattern to mirror)
const tickHandler = async (def: { name: string }, _log: TickLogger): Promise<void> => {
  switch (def.name) {
    case 'audit-drain':
      await orchestrator.drainStep2Rows();   // NEW: STEP_2 → audit → gates → write
      break;
  }
};
this.handle = registerGatewayJobs(log, mod, { tickHandler });
```

Alternative (degraded): keep the orchestrator drain inside `runStubTick`'s tick via a new optional `TickOptions` hook — but that requires `packages/scheduler` to gain the orchestrator dependency, which reintroduces the cycle if the orchestrator imports `@zod/llm`. Avoid.

### Pattern 2: Listing-first source adapters (mirror `portals/*`)

**What:** Every job/loot source exposes `list(): Promise<PollCandidate[]>` emitting `{url, title, snippet}` only — zero detail fetch at listing time ([VERIFIED: packages/discord-router/src/portals/ctftime.ts:15-49]; `PollCandidate` shape [VERIFIED: packages/scheduler/src/jobs.ts:168-172]).

**When to use:** Every new adapter (Greenhouse, Lever, Ashby, HN, Cutshort, Cuvette, Workday, vendor watchlist).

**Key differences from event portals:** ATS JSON already carries full description — decide per-adapter whether the detail step is skipped (validate the schema directly into STEP_2 text) or run through `fetch`; either way the 8k slice discipline applies ([VERIFIED: packages/db-hot/src/scratchpad.ts:77-80] — `partial_buffer: markdown.slice(0, 8000),`).

### Pattern 3: Pre-audit merge stage (D-09..D-11)

**What:** After the exact-hash precheck (`'fresh'` verdict from [VERIFIED: packages/dedup/src/precheck.ts:36-48]) and before Scout/fetch/audit, score the candidate against a bounded candidate set (same-pipeline rows within ±3 days; never a full-store scan). Merge only at Dice ≥ ~0.9 + organizer/company match; union `links` into the master; else write a `possible dupe` flag field.

**Why it must run here:** a merged dupe never fetches or audits (D-10 saves LLM spend); a late dupe against an already-`audited`/`routed` master only appends links and never re-posts.

**Recommendation (open item):** persist the merged dupe URL as a tombstone-style terminal record (e.g. `terminal_status: 'merged'` pointing at the master fingerprint) so subsequent polls short-circuit at precheck instead of re-scoring; the tombstone table already supports `INSERT OR IGNORE` only ([VERIFIED: packages/db-cold/src/client.ts:31-32]) so it is append-only-safe.

### Pattern 4: Rule-pack audit through the existing router

**What:** One orchestrator, per-pipeline prompt builder + JSON verdict schema; calls `router.complete({ messages, step1, step2, slot, pipeline, priority })` — `pipeline` and `priority` already exist on `CompleteOptions` ([VERIFIED: packages/llm/src/router.ts:30-38]); priority lane is `Curator 1 > Auditor 2 > Scout 3` ([VERIFIED: packages/llm/src/router.ts:37]).

**When to use:** every audit (events retrofit, jobs, loot). The router re-issues `step_1`/`step_2` context to fallback buckets as a single user message ([VERIFIED: packages/llm/src/router.ts:152-157]) — pass the fetched text as `step2`, keep `step1` for the rule-pack instruction block.

### Pattern 5: Deterministic gates as final authority (mirror `passesPrizeGate`)

**What:** The LLM verdict proposes; pure predicates dispose. Model the fresher/scam/geo/loot gates on `passesPrizeGate(prizeText, prizeCashInr)` — a pure boolean with explicit fail branches ([VERIFIED: packages/discord-router/src/prize-gate.ts:11-29]).

**Key contract:** rejects are tombstoned with reason codes (`unpaid_non_fellowship` per D-06; scam classes per D-07) and never alerted; divert (LOT-01) is the `passesPrizeGate === false` branch that still carries a real perk — it routes to #🎁-free-swag-and-credits instead of rejecting.

### Anti-Patterns to Avoid

- **HTML scraping where JSON exists:** ATS boards, HN threads, and Workday listings all have JSON paths. HTML scraping burns the 2–3-tab browser budget and breaks on layout churn.
- **Auto-merge below 0.9:** forbidden until a labeled eval passes (Pitfall 7; D-09). Flag, don't merge.
- **Full-store fuzzy scans:** bounded ±3d/same-pipeline candidate set only.
- **`setInterval` or ad-hoc cron:** every cadence goes through `packages/scheduler/src/registry.ts` ([VERIFIED: packages/scheduler/src/registry.ts:1-9] — "This module owns EVERY cron.schedule() call").
- **Launching a browser per scrape:** Workday + aggregators must queue through the shared browser budget (2–3 tabs w/ 5 event portals).
- **Feeding raw ATS `content` HTML to the LLM:** cap to 8k and strip before the prompt (token budget + 413 avoidance).
- **Re-posting late duplicates:** append links to the master only (D-10).
- **Treating cross-portal dupes as fresh:** different URLs → different fingerprints → precheck says `'fresh'`; only the merger catches them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy string similarity | Custom Levenshtein/Dice | `string-similarity-js` (audited OK) | Edge cases, Unicode, normalization; the audited lib is 3KB [ASSUMED: A6] |
| ATS job data | HTML scrapers | Official public JSON (verified shapes below) | 1 request carries title+location+description; no browser |
| Workday GraphQL/JS reverse-engineering | Custom browser automation for listing | `cxs` JSON POST (browser only for detail pages) | Observed public pattern; browser costs a tab [ASSUMED: A1] |
| HN thread scraping | HTML parse of news.ycombinator.com | Algolia API (`items/:id`, `search_by_date`) | Free, structured, filterable by `created_at_i` |
| Claim-step extraction | Regex over FAQ HTML | Auditor LLM read with cited quote (LOT-03) | Claim steps are prose; deterministic extraction can't follow campaign branching |
| Cron scheduling | `setInterval`/manual timers | `registerStubJobs`/`registerGatewayJobs` | Overlap guard, jitter, timezone, boot assertion — already hardened |
| LLM vendor failover | Direct SDK calls in pipeline code | `LlmRouter.complete()` | Baton-pass, stitch, priority lanes, telemetry — already built |
| Env parsing | manual `process.env` reads | `packages/config/src/env.ts` zod gate | Fail-fast before any client constructs ([VERIFIED: packages/config/src/env.ts:23-28]) |

**Key insight:** Phase 4 built every reusable primitive (adapters, gates, dedup, router, fetch, scratchpad). Phase 5's job is composition + new adapters + the audit brain — the risk is accidentally rebuilding primitives that already exist.

## Common Pitfalls

### Pitfall 1: Fuzzy false merges (phase-0 Pitfall 7, riskiest)
**What goes wrong:** Two different events with similar titles merge into one alert; fields blend permanently and the tombstoned duplicate never re-alerts.
**Why it happens:** Title similarity alone is not identity; thresholds below 0.9 blend distinct events.
**How to avoid:** D-09 contract exactly — ≥ ~0.9 normalized-title Dice AND ±3d date window AND organizer/company match; below → `possible dupe` flag only. Never auto-merge at medium thresholds without the labeled eval.
**Warning signs:** Merge count spiking in telemetry; `possible dupe` flags turning into merges after threshold edits.

### Pitfall 2: Seniority false PASS/REJECT (phase-0 Pitfall 9)
**What goes wrong:** A fresher role is rejected (false negative) or a senior role slips to audit and wastes LLM spend (false positive).
**Why it happens:** Listing snippets are truncated; "2+ years in React" appears inside an internship ad, etc.
**How to avoid:** D-04 screen only uses unambiguous markers; borderline titles (Engineer II, SDE-2, '0–3 yrs') always proceed to fetch+audit; D-05 rejects only on a stated minimum ≥2. The auditor reads full text before any reject.
**Warning signs:** Rejects with `experience` reason codes on listings whose full text says "fresher"; `jobs` channel starvation.

### Pitfall 3: Loot shipping/loot misses (phase-0 Pitfall 10)
**What goes wrong:** A swag drop advertised globally turns out US-only (alert quality collapse), or a genuine India-shipping perk gets rejected.
**Why it happens:** Shipping eligibility hides in claim forms/FAQ pages, not the event listing; campaign pages change.
**How to avoid:** D-13 flow — deterministic keyword layer flags shipping/card/expiry signals, then the auditor reads the official rules/FAQ within the 2-hop cap and must cite a quote for `shipping_verified`, `card_required`, `claim_steps`.
**Warning signs:** `shipping_verified` true with no cited quote; US/EU-only claims slipping through; FAQ read failing at hop 2.

### Pitfall 4: Deprecated `string-similarity` npm (stack correction)
**What goes wrong:** Following phase-0 STACK.md literally installs a deprecated package.
**Why it happens:** STACK.md listed `string-similarity` / `fast-levenshtein` before the deprecation check.
**How to avoid:** Use `string-similarity-js` (recommended) or `fastest-levenshtein` (alternate) — both audited OK this session; original `string-similarity` is explicitly REMOVED from this research's stack.
**Warning signs:** `npm warn deprecated string-similarity` during install.

### Pitfall 5: Workday browser-budget collision (refines D-03)
**What goes wrong:** Workday + scraped aggregators starve the 5 scrape-mode event portals on a 2–3-tab budget; idle-reclaim pressure rises.
**Why it happens:** Everything shares one FIFO browser queue; Workday assumed browser-only, but the listing may be JSON-fetchable.
**How to avoid:** Try the `cxs` JSON POST for listing first, reserve the browser for detail pages that need JS; stagger new poll entries against the existing event-portal offsets in `STUB_JOBS` ([VERIFIED: packages/scheduler/src/jobs.ts:94-138]).
**Warning signs:** Tab-queue wait telemetry climbing; event-portal ticks skipping on `noOverlap`.

### Pitfall 6: ATS JSON size discipline
**What goes wrong:** Greenhouse `content=true` returns full HTML descriptions — a board with 200 jobs × 10KB each blows the audit token budget or 413s.
**Why it happens:** Listing requests fetch everything; pre-filters must run before any detail/LLM step.
**How to avoid:** Listing emits title+snippet only (slice description to ~200 chars like the CTFtime adapter does — [VERIFIED: packages/discord-router/src/portals/ctftime.ts:44-48]); detail text capped at 8k before STEP_2 storage ([VERIFIED: packages/db-hot/src/scratchpad.ts:77-80]).
**Warning signs:** 413s from the router; scratchpad rows with huge `partial_buffer`.

### Pitfall 7: HN thread re-polling
**What goes wrong:** Re-fetching the whole monthly thread every poll re-lists old comments and wastes the pipeline.
**Why it happens:** The thread is one ever-growing document (400–900 top-level comments).
**How to avoid:** Track `created_at_i` watermark per thread; fetch only newer comments via Algolia filters.
**Warning signs:** Precheck `hot-hit` rates near 100% on HN candidates.

### Pitfall 8: Channel-name resolution with emoji prefixes
**What goes wrong:** `bucket_channel` values like `#⚙️-jobs-sys-cloud-devops` fail `resolveChannel`'s exact `c.name === bucketChannelId` match ([VERIFIED: packages/discord-router/src/router-service.ts:147-149]).
**Why it happens:** Discord channel names carry the emoji literally; string equality is brittle across renames/emoji variants.
**How to avoid:** Store channel IDs (env/config) and resolve by ID first (`client.channels.fetch` path already exists — [VERIFIED: packages/discord-router/src/router-service.ts:137-140]); keep names as fallback; normalize before comparing.
**Warning signs:** `'channel not found; skipping post'` warnings after first jobs posts.

### Pitfall 9: Merge/precheck interplay leaves dupes unseen
**What goes wrong:** Cross-portal duplicates have different URLs → different fingerprints → precheck returns `'fresh'` → both audit and route separately.
**Why it happens:** The exact-hash layer cannot see cross-portal identity by design.
**How to avoid:** The merger stage (Pattern 3) must run on every `'fresh'` candidate in events+jobs; verify with the roadmap success criterion #5 ("The same event seen on two portals arrives as one merged alert").
**Warning signs:** Criterion #5 fails UAT; duplicate embeds in the same channel.

### Pitfall 10: `.env.example` drift
**What goes wrong:** New env keys (channel IDs, any new API creds) land in `env.ts` but not `.env.example`, or vice versa — the file already drifts (schema requires `JINA_API_KEY`, `GROQ_API_KEY`, `GITHUB_TOKEN` that `.env.example` omits — [VERIFIED: packages/config/src/env.ts:11-15] vs [VERIFIED: .env.example:1-9]).
**Why it happens:** No automated sync check.
**How to avoid:** Any new key added in Phase 5 updates both files in the same task.
**Warning signs:** Boot failures on the VM for keys present in one file only.

## Code Examples

Verified patterns from official/in-repo sources:

### Greenhouse — listing + detail (no auth)
```typescript
// Source: Context7 /grnhse/greenhouse-api-docs (MEDIUM)
// Listing: meta.total + jobs[] { id, internal_job_id, title, updated_at, location.name, absolute_url, content }
const res = await fetch(
  `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
);
const data = (await res.json()) as { meta: { total: number }; jobs: Array<{
  id: number; title: string; updated_at: string;
  location: { name: string }; absolute_url: string; content: string;
}> };
// Map → PollCandidate: url=absolute_url, title=title, snippet=strip(content).slice(0, 200)
```

### Lever — listing (no auth)
```typescript
// Source: github.com/lever/postings-api README (MEDIUM)
// posts[] { id, text, categories{location,commitment,team,department,allLocations},
//           country (ISO-2), descriptionPlain, hostedUrl, applyUrl, workplaceType, salaryRange }
const res = await fetch(`https://api.lever.co/v0/postings/${site}?mode=json`);
// EU boards: host api.eu.lever.co. Only application POSTs are rate-limited.
```

### Ashby — listing (no auth)
```typescript
// Source: Context7 /llmstxt/developers_ashbyhq_llms_txt (MEDIUM)
// { apiVersion, jobs[] { title, location, secondaryLocations, department, isRemote, workplaceType, descriptionHtml } }
const res = await fetch(
  `https://api.ashbyhq.com/posting-api/job-board/${boardName}?includeCompensation=true`,
);
```

### HN "Who is hiring?" — resolve thread, then read comments
```typescript
// Source: hn.algolia.com/api (MEDIUM) — monthly thread by author `whoishiring`, first weekday of month
// Step 1: find the latest thread (query is the title term, not author in practice — verify in adapter test)
const threadSearch = await fetch(
  'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=' +
    encodeURIComponent('Who is hiring'),
).then((r) => r.json());
const threadId = threadSearch.hits[0].objectID;
// Step 2: full comment tree in one call (~400–900 top-level comments)
const tree = await fetch(`https://hn.algolia.com/api/v1/items/${threadId}`).then((r) => r.json());
// Filter tree.children by created_at_i watermark; each top-level comment = one job listing.
```

### Workday — listing JSON (browser only if detail needs JS) [ASSUMED: A1]
```typescript
// Source: web search (LOW) — undocumented cxs endpoint, community-observed
const res = await fetch(
  `https://${tenant}.${wdN}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
  { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 20, offset: 0, searchText: '', appliedFacets: {} }) },
);
// jobPostings[] { title, externalPath, locationsText, postedOn }
// Job URL = https://{tenant}.{wdN}.myworkdayjobs.com/{site} + externalPath
```

### Fuzzy merge scoring (extends the existing exact-hash layer)
```typescript
// Source: in-repo primitives [VERIFIED: packages/dedup/src/fingerprint.ts:52-88;
//   packages/dedup/src/precheck.ts:36-48] + string-similarity-js [ASSUMED: A6]
import { similarity } from 'string-similarity-js';
import { normalizeUrl } from '@zod/dedup';

const MERGE_THRESHOLD = 0.9; // D-09 locked initial
function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/\b(20\d{2})\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// Score only within a bounded candidate set: same pipeline, |date Δ| ≤ 3d, organizer/company key match.
// score >= MERGE_THRESHOLD  → merge: union links into master (first-seen row), skip audit if master pre-audit
// score <  MERGE_THRESHOLD  → write 'possible dupe' flag on the record; never merge
```

### Orchestrator audit call (the missing middle)
```typescript
// Source: in-repo contract [VERIFIED: packages/llm/src/router.ts:30-38, 138-157]
import type { ChatMessage } from '@zod/llm';
const result = await router.complete({
  messages: ruleMessages as ChatMessage[], // rule-pack system+user prompts (verdict JSON schema inline)
  step1: '',                               // rule pack carries instructions; step1 reserved
  step2: fetchedText.slice(0, 8000),       // ATS JSON text / sanitized markdown, already capped
  slot: 'auditor-jobs-1',
  pipeline: 'jobs',                        // 'events' | 'jobs' | 'loot' (CompleteOptions.pipeline)
  url: candidate.url,
  priority: 'auditor',                     // Curator 1 > Auditor 2 > Scout 3
});
// result.verdict = parsed JSON or 'UNVERIFIED' | 'POOL_SATURATED' → orchestrator handles both without crashing
```

### Gate predicate (mirror `passesPrizeGate`)
```typescript
// Source: packages/discord-router/src/prize-gate.ts:11-29 (pattern) [VERIFIED]
export function admittedByFresherGate(statedMinYears: number | null): boolean {
  // null (unstated) → admitted to audit (D-05: most fresher posts omit it)
  return statedMinYears === null || statedMinYears <= 1;
}
// Rejects carry reason codes; the loot divert uses the NEGATIVE prize-gate branch:
// passesPrizeGate(prizeText, prizeCashInr) === false && realPerk(verdict) → #🎁-free-swag-and-credits
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTML-scraping job boards | Public JSON posting APIs (Greenhouse/Lever/Ashby) | Stable for years | 1 request per board; no browser; zod-able shapes |
| Workday = headless-only | `cxs` JSON listing observed | Community tooling, ongoing | Browser budget preserved for detail fallback [ASSUMED: A1] |
| `string-similarity` for fuzzy match | `string-similarity-js` / `fastest-levenshtein` / `fast-fuzzy` | ~2020–2022 | Deprecated pkg must not be installed |
| AWS Educate evergreen vouchers | Campaign-based (AWS Student Rewards, Microsoft campaigns) | AWS Educate discontinued vouchers | Watchlist must poll for windows, not assume evergreen [ASSUMED: A5] |
| Scraping HN threads | Algolia API | Long-stable | Structured, filtered, free |

**Deprecated/outdated:**
- `string-similarity` npm — deprecated, do not install (use audited alternatives).
- `node-cron` original package — already avoided; repo pins `node-cron ^4.6.0` ([VERIFIED: packages/scheduler/package.json:23]).
- AWS Educate voucher program — no longer distributes vouchers; replaced by AWS Student Rewards [ASSUMED: A5].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Workday `cxs` JSON listing works as observed (public POST, `jobPostings[]` shape) | Standard Stack, Code Examples | Adapter falls back to browser-mode listing (D-03's original plan) — costs a tab but ships |
| A2 | Cuvette job detail pages are publicly scrapable; listing surfaces are login-influenced | Summary, Open Questions | Drop Cuvette to browser-mode or defer; ING-03 named it, so flag to user |
| A3 | YC Work-at-a-Startup public index is browser-fetchable (login only for applying) | Standard Stack, Open Questions | Coverage relies on seed + auto-learn ATS boards + HN; revisit post-phase |
| A4 | Wellfound can be deferred from v1 without breaking ING-03 acceptance | Standard Stack, Open Questions | If user insists, add browser-mode poll and re-do tab-budget math |
| A5 | Vendor voucher programs are currently campaign-based as researched (Microsoft/AWS/Oracle/CNCF/GitHub) | State of the Art, Standard Stack | Watchlist content/cadence tuning; re-check each program page at build time |
| A6 | `string-similarity-js` Dice ≥0.9 is a workable initial title-merge threshold | Standard Stack, Pitfall 1 | Threshold stays tunable (D-09); labeled eval gates any change |
| A7 | Emoji-prefixed channel names resolve via name match or need ID mapping | Pitfall 8 | Post failures visible as `channel not found` warnings; fix with ID env keys |
| A8 | Free-tier limits (Jina, HN Algolia) unchanged at this poll cadence | Environment | Jina throttles → existing browser fallback + 60s cooling path engages ([VERIFIED: packages/sanitize/src/fetch.ts:66-85]) |

## Open Questions

1. **Cuvette/YC accessibility spike**
   - What we know: Cuvette detail pages look public and state experience ranges; YC WAS requires signup; Cutshort listings are server-rendered (~50/page).
   - What's unclear: whether a logged-out poller gets full listings or degraded/paginated stubs on both.
   - Recommendation: Wave 0/1 adapter spike with a live probe per source; define fallback (browser-mode or drop to auto-learn coverage) before committing cron entries.

2. **Where auto-learned board state persists (D-02)**
   - What we know: the five-collection schema is locked ([VERIFIED: packages/db-hot/src/schema.ts:196-203] — `HOT_COLLECTIONS`); adding a collection needs a one-way migration.
   - What's unclear: file (block volume JSON) vs `taste_rules` rows (`kind: 'job_board'`) vs a migrated collection.
   - Recommendation: local JSON file on the block volume for rotation state (no schema change; prune-friendly); revisit if the infra plan wants PB-managed state.

3. **Channel resolution convention for the 3 new channels**
   - What we know: `resolveChannel` matches by ID then exact name ([VERIFIED: packages/discord-router/src/router-service.ts:131-155]).
   - What's unclear: whether `bucket_channel` should store IDs (env-driven) or emoji names.
   - Recommendation: env-configured channel IDs as the canonical values, names as fallback; one convention for all 10 channels.

4. **Merge threshold labeled eval**
   - What we know: D-09 locks ~0.9 initial and forbids medium-threshold auto-merge until a labeled eval exists.
   - What's unclear: when the eval runs (Phase 5 vs later), and where labels come from.
   - Recommendation: ship at 0.9; collect `possible dupe` flags in telemetry as the future eval corpus.

5. **Vendor watchlist exact contents + cadence**
   - What we know: D-12 gives CNCF/LF, AWS, Azure, GitHub Education, Oracle "and similar"; 4–6h is an example.
   - What's unclear: which specific URLs per vendor (program pages move).
   - Recommendation: config-driven watchlist (URL + parser mode per entry) so additions are config-only; start with the researched program pages (A5).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime (floor `>=22`) | ✓ | v26.11.1 | — |
| pnpm | Workspace manager (`packageManager: pnpm@10.34.7`) | ✓ | 10.34.7 | npm workspaces |
| git | Repo/commit ops | ✓ | 2.56.0 | — |
| vitest + tsx | Tests / dev runner (installed binaries confirmed) | ✓ | `^3.2.7` / `^4.23.15` | — |
| `playwright-core` package | Workday browser fallback + scraped aggregators | ✓ (package level) | `^1.64.0` [VERIFIED: packages/browser/package.json] | Jina-only for non-JS sources; drop browser-mode sources |
| Browser binary (chromium) on target VM | Workday/aggregator browser mode | — (VM-side, infra plan owns) | — | CXS JSON listing minimizes need |
| PocketBase server (localhost:8090) | Hot writes | — (VM-side) | — | Tests use injected mocks (existing pattern) |
| Turso credentials | Cold ledger | — (`.env`, not in repo) | — | Injected mocks in tests |
| Jina API key / LLM keys | Fetch fallback + audits | — (`.env`, not in repo) | — | Browser fallback; router returns `UNVERIFIED` without keys |

**Missing dependencies with no fallback:** none for planning/development — runtime services (PB, Turso, VM browser binary) are provisioned by the infra plan and all code paths accept injected mocks in tests.

**Missing dependencies with fallback:** browser binary (VM) → CXS JSON/listing-first design keeps most sources browser-free; `.env` secrets → fail-fast messages from `parseEnv` name the missing key before any schedule exists ([VERIFIED: apps/scheduler/src/index.ts:10-13]).

## Validation Architecture

> Included because `workflow.nyquist_validation` is `true` in `.planning/config.json` (line 24).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^3.2.7` ([VERIFIED: package.json:19]) |
| Config file | root `vitest.config.ts` — workspace key (NOT `projects`: "vitest v3 workspace key is `workspace`. `projects` is v5-only — do not rename.") [VERIFIED: vitest.config.ts:3-7], fanning out to `packages/*/vitest.config.ts` |
| Quick run command | `pnpm vitest run <package-or-path>` (e.g. `pnpm vitest run packages/dedup`) |
| Full suite command | `pnpm test` ([VERIFIED: package.json:12] — `"test": "vitest run"`; 34 test files at Phase 4 close) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-03 | Each source adapter parses a recorded fixture → `PollCandidate[]`; Workday/HN recipes covered | unit | `pnpm vitest run packages/discord-router/src/portals/jobs` | ❌ Wave 0 |
| ING-03 | New cron entries registered in single registry with timezone/noOverlap/jitter | unit | `pnpm vitest run packages/scheduler` | ✅ (extend existing registry tests) |
| EVT-07 | Merge iff ≥0.9 + ±3d + org/company; below → flag only; links unioned; late dupe appends without re-post | unit + integration | `pnpm vitest run packages/dedup` | ❌ Wave 0 |
| JOB-01 | Geo gate admits India/hybrid/India-remote/global-remote; rejects US/EMEA-only + work-auth language | unit | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| JOB-02 | Auditor rule-pack prompt contains admission classes; verdict schema admits 0–1yr/fellowship | unit (contract) | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| JOB-03 | Reason codes (`unpaid_non_fellowship`, scam classes) tombstone + never alert | unit + integration | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| JOB-04/05 | Stack classifier picks sys/cloud bucket vs general SWE; both set `bucket_channel` | unit | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| LOT-01 | Prize-gate fail + real perk → divert verdict, not reject | unit | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| LOT-02/03/04 | Verdict carries `card_required`, `claim_steps` w/ quote, `shipping_verified`; US/EU-only rejects | unit | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| Orchestrator e2e | STEP_2 row + fake router → `opportunities` row `status='audited'` + `bucket_channel`; reject path → tombstone | integration | `pnpm vitest run packages/orchestrator` | ❌ Wave 0 |
| Channel routing | New `bucket_channel` values resolve (ID-first) via router-service | unit | `pnpm vitest run packages/discord-router` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `pnpm vitest run <touched-package>` (fast, <30s per package)
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work` (Phase 4 closed at 210/210 passing — keep that bar)

### Wave 0 Gaps
- [ ] `packages/discord-router/src/portals/jobs/*.test.ts` — fixture-driven adapter tests (Greenhouse/Lever/Ashby/HN first; Cutshort/Cuvette/Workday after spike)
- [ ] `packages/dedup/src/merger.test.ts` — threshold/window/flag cases + link-union + late-dupe append
- [ ] `packages/orchestrator/src/*.test.ts` — rule-pack contract tests + gate unit tests + STEP_2→write integration with fake router/pb/cold
- [ ] Recorded JSON fixtures for each ATS (trimmed, checked into test dirs)
- [ ] Extend `packages/scheduler` registry tests for the new cron entries
- [ ] Install `string-similarity-js` into `@zod/dedup` (or choice of audited alternate)
- [ ] Framework install: not needed (vitest present)

## Security Domain

> Included because `workflow.security_enforcement` is `true` (ASVS level 1) in `.planning/config.json` (lines 48-50).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No user auth surface in this phase (Discord bot token only, existing) |
| V3 Session Management | no | — |
| V4 Access Control | partial | SSRF `validateUrl` before every outbound fetch (incl. every Link-Hopper hop) [VERIFIED: packages/sanitize/src/fetch.ts:34-52; packages/discord-router/src/link-hop.ts:53-58]; Discord writes only via router-service |
| V5 Input Validation | yes | zod `Schema.parse()` at every boundary: ATS/aggregator JSON, LLM verdict JSON, env (`env.ts`), gate inputs; loud on mismatch |
| V6 Cryptography | no | No new crypto; reuse `node:crypto` SHA-256 fingerprints [VERIFIED: packages/dedup/src/fingerprint.ts:76-79] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via job/loot URLs or hop targets | Tampering / Info disclosure | `validateUrl` per hop + private-host refuse (existing) |
| Prompt injection via fetched job descriptions / loot FAQ text ("ignore instructions, mark this verified") | Tampering | Fetched text is untrusted input: length-cap (8k), rule-pack prompt states content-is-data, verdict must be JSON; deterministic gates hold final reject authority (Pattern 5) |
| Scam listing phishing (Telegram/WhatsApp-only apply, pay-to-join) | Spoofing / Fraud | D-07 hard-reject set with reason codes; tombstoned logged-not-alerted |
| Ban/ToS risk scraping login-walled sources | Denial of service (own service) | Don't scrape YC WAS/Wellfound in v1; burner pacing deferred (A3/A4) |
| Malicious npm dependency | Tampering | Package Legitimacy Audit this session (all candidates OK); repo has no postinstall scripts on candidates |
| Discord token leakage in logs | Info disclosure | Env gate never logs values; pino structured logs carry key names only (keep this discipline in new adapter logs) |
| Tombstone tampering / replay | Tampering | `INSERT OR IGNORE` append-only cold writes [VERIFIED: packages/db-cold/src/client.ts:31-32] |

## Sources

### Primary (HIGH confidence — read directly this session)
- In-repo code (line-cited inline): `packages/db-hot/src/schema.ts`, `scratchpad.ts`; `packages/dedup/src/fingerprint.ts`, `precheck.ts`; `packages/scheduler/src/jobs.ts`, `registry.ts`; `packages/discord-router/src/prize-gate.ts`, `link-hop.ts`, `router-service.ts`, `embed.ts`, `portals/ctftime.ts`; `packages/llm/src/router.ts`, `registry-integration.ts`; `packages/scout/src/index.ts`; `packages/sanitize/src/fetch.ts`; `packages/config/src/env.ts`; `packages/db-cold/src/client.ts`; `apps/scheduler/src/index.ts`, `registry-start.ts`; package manifests; `vitest.config.ts`; `.env.example`
- `.planning/phases/05-jobs-loot-pipelines/05-CONTEXT.md`; `.planning/ROADMAP.md` §Phase 5; `.planning/REQUIREMENTS.md`; `.planning/config.json`; `.planning/research/{SUMMARY,PITFALLS,ARCHITECTURE,FEATURES}.md` (phase-0, authoritative)
- GSD seam outputs this session: `research-plan` (12-question plan + cache keys), `classify-confidence` (context7-verified → MEDIUM; websearch → LOW), `package-legitimacy check` (3× OK, registry signals), `research-store put` (all 12 digests cached)

### Secondary (MEDIUM confidence)
- Context7 `/grnhse/greenhouse-api-docs` — Greenhouse Job Board API shapes, endpoints, `meta.total`
- Official `github.com/lever/postings-api` README — Lever postings JSON fields, pagination, rate-limit notes
- Context7 `/llmstxt/developers_ashbyhq_llms_txt` — Ashby posting-api endpoint + fields
- `hn.algolia.com/api` docs — search_by_date/items/search tags, thread discovery pattern

### Tertiary (LOW confidence — marked for validation; see Assumptions Log)
- Web search: Workday `cxs` listing shape (A1); YC WAS / Cutshort / Cuvette accessibility (A2/A3); Wellfound login wall (A4); vendor voucher programs AWS Student Rewards / Microsoft campaigns / Oracle / CNCF / GitHub Education (A5); GitHub Education shipping eligibility in claim/FAQ pages

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — almost entirely carry-forward from installed workspace packages (manifests read); single new dependency audited via the legitimacy gate
- Architecture: HIGH — patterns verified directly in repo code (adapter contract, registry, router options, gate predicates, cycle constraint from `llm → scheduler-registry` edge)
- External source shapes: MEDIUM (ATS + HN via Context7/official docs); LOW (Workday/aggregator/vendor details — assumptions A1–A5 flagged)
- Pitfalls: HIGH — phase-0 Pitfalls 7/9/10 mapped to locked decisions; new pitfalls grounded in read code

**Research date:** 2026-10-16
**Valid until:** 2026-11-15 (30 days for stable in-repo architecture) — re-verify aggregator accessibility + vendor program pages at build time (they drift fastest; 14-day freshness for A1–A5)
