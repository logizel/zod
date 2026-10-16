---
phase: 05-jobs-loot-pipelines
plan: 04
subsystem: orchestrator
tags: [loot, events, orchestrator, drain, vendor-watchlist, typescript, vitest, zod]

# Dependency graph
requires:
  - phase: 05-jobs-loot-pipelines/01
    provides: orchestrator package, jobs rule pack + gates, drainStep2Rows, JOB_POLL_JOBS/AUDIT_JOBS tables, registerAuditDrain/registerPollJobs, candidateSources injection
provides:
  - loot rule pack (buildLootMessages/parseLootVerdict) + loot gates (evaluateLootGates) + loot FAQ reader (readLootRules)
  - drainLootRow named export + pipeline dispatch in drainStep2Rows (loot branch)
  - events rule pack (buildEventsMessages/parseEventsVerdict) + events branch with prize-gate divert into loot
  - vendor watchlist (WATCHLIST + list()/getLootCandidates) + candidateSources['loot'] live wiring
  - discord-router exports: ./link-hop, ./prize-gate, ./domain-filter, ./portals/loot/*
affects: [05-05 merger, 05-06 mixed-batch, 05-07 probe-first, 05-08 schema, 05-09 scheduler]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 22844
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drain branch as named export (drainLootRow) reused by events divert — no duplicated logic"
    - "Pipeline dispatch in drainStep2Rows keyed on scratchpad row.pipeline (code-owned, never candidate data)"
    - "Loot gates mirror prize-gate purity: pure predicates, no I/O, enumerated reason codes"
    - "Link-Hopper 2-hop cap + SSRF-guarded validateUrl on every fetch target (FAQ read, vendor pages)"
    - "Vendor watchlist: config-owned fixed hosts, never-throw entry isolation, URL-deduped fan-out"

key-files:
  created:
    - packages/orchestrator/src/rule-packs/loot.ts - buildLootMessages + parseLootVerdict (LOT-02/03/04 verdict schema)
    - packages/orchestrator/src/gates/loot.ts - evaluateLootGates pure predicate + BUCKET_LOOT
    - packages/orchestrator/src/loot-faq.ts - readLootRules (2-hop SSRF-guarded FAQ read, capped 8000)
    - packages/orchestrator/src/rule-packs/events.ts - buildEventsMessages + parseEventsVerdict
    - packages/orchestrator/src/orchestrator.test.ts - loot + events branch drain tests
    - packages/orchestrator/src/rule-packs/events.test.ts - events rule pack contract tests
    - packages/orchestrator/src/gates/loot.test.ts - loot gates matrix tests
    - packages/orchestrator/src/loot-faq.test.ts - FAQ reader hop-cap/SSRF tests
    - packages/discord-router/src/portals/loot/vendors.ts - WATCHLIST + fetchAll/list/getLootCandidates
    - packages/discord-router/src/portals/loot/vendors.test.ts - watchlist keyword/dedupe/isolation tests
  modified:
    - packages/orchestrator/src/orchestrator.ts - drainLootRow + processEventsRow + pipeline dispatch
    - packages/orchestrator/src/index.ts - loot + events exports
    - packages/orchestrator/vitest.config.ts - aliases for link-hop/prize-gate/domain-filter/sanitize-fetch/scout
    - packages/orchestrator/package.json - @zod/discord-router/@zod/sanitize/@zod/scout deps
    - packages/orchestrator/tsconfig.json - discord-router/sanitize/scout references
    - packages/discord-router/package.json - ./link-hop, ./prize-gate, ./domain-filter, ./portals/loot/* exports
    - apps/scheduler/src/registry-start.ts - candidateSources['loot'] wired into live deps

key-decisions:
  - "drainLootRow is a named export reused verbatim by the events divert path — zero duplicated logic between direct loot branch and divert"
  - "Events bucket mapping reads Phase 4 constants verbatim: sys-cp-sec → '#🔥-priority-sys-cp-sec', general → '#-online-1lakh-plus'"
  - "Domain filter reuses @zod/discord-router/domain-filter prefilter with organizer_score/agenda_score from the verdict; tombstone reason uses its vocabulary verbatim"
  - "Vendors.ts uses globalThis.fetch + validateUrl + keyword layer (no cheerio/browser dep) — static pages, SSRF-guarded, never-throw entry isolation"

requirements-completed: [LOT-01, LOT-02, LOT-03, LOT-04]

coverage:
  - id: D1
    description: Loot rule pack + gates + FAQ reader with full LOT-02/03/04 matrix (shipping/card/claim/offer-cost)
    requirement: LOT-02, LOT-03, LOT-04
    verification:
      - kind: unit
        ref: packages/orchestrator/src/rule-packs/loot.test.ts#parseLootVerdict round-trips + malformed→null
        status: pass
      - kind: unit
        ref: packages/orchestrator/src/gates/loot.test.ts#loot_us_eu_only / loot_shipping_unverified / loot_claim_steps_unreadable / loot_not_fully_free / admit
        status: pass
      - kind: unit
        ref: packages/orchestrator/src/loot-faq.test.ts#2-hop success / hop failure / SSRF block / fetch failure
        status: pass
    human_judgment: false
  - id: D2
    description: Orchestrator loot drain branch (readLootRules → rule pack → router → gates → write/tombstone) with hop cap ≤2 and idempotent re-drain
    requirement: LOT-02, LOT-03, LOT-04
    verification:
      - kind: integration
        ref: packages/orchestrator/src/orchestrator.test.ts#loot branch admit/reject/link_hop_failed/re-drain/UNVERIFIED/POOL_SATURATED
        status: pass
    human_judgment: false
  - id: D3
    description: Events rule pack + drain events branch: resolve → domain filter → prize gate → admit bucket | divert (perk_hint → drainLootRow) | prize_below_threshold
    requirement: LOT-01
    verification:
      - kind: unit
        ref: packages/orchestrator/src/rule-packs/events.test.ts#parseEventsVerdict round-trips + malformed→null
        status: pass
      - kind: integration
        ref: packages/orchestrator/src/orchestrator.test.ts#events admit bucket / prize_below_threshold / divert single-terminal / link_hop_failed / domain-filter reject
        status: pass
    human_judgment: false
  - id: D4
    description: Vendor watchlist source + live loot wiring (candidateSources['loot']) with config-driven entries and URL-deduped fan-out
    requirement: D-12 path 2
    verification:
      - kind: unit
        ref: packages/discord-router/src/portals/loot/vendors.test.ts#signal/no-signal/failure-isolation/rss/config-change/dedupe/WATCHLIST
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-10-16
status: complete
---

# Phase 05 Plan 04: Jobs + Loot Pipelines — Loot Vertical + Events Completion Summary

**Loot vertical delivered end-to-end and events path completed through the same drain:** perk-carrying events failing the ₹1L rule divert to loot verification instead of tombstoning; a config-driven vendor watchlist feeds a second loot source; the events branch of the audit drain goes live with resolve → domain filter → prize gate → category-bucket routing (no more test-time verdict injection).

## Performance

- **Duration:** 20 min
- **Started:** 2026-10-16T09:20:25Z
- **Completed:** 2026-10-16T09:40:25Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments

- Loot rule pack (`buildLootMessages`/`parseLootVerdict`) with LOT-02/03/04 verdict schema: `shipping_verified`, `shipping_region`, `shipping_quote`, `card_required`, `offer_cost`, `claim_steps[{step,quote}]`, `audit_summary`
- Loot deterministic gates (`evaluateLootGates`): `loot_us_eu_only`, `loot_shipping_unverified`, `loot_claim_steps_unreadable`, `loot_not_fully_free` rejects; admit with bucket `#🎁-free-swag-and-credits`
- Loot FAQ reader (`readLootRules`): 2-hop SSRF-guarded Link-Hopper resolution → sanitize facade → capped 8000 chars; null on any hop/fetch failure
- `drainLootRow` named export — the drain loot branch, reused verbatim by the events divert path (zero duplicated logic)
- Events rule pack (`buildEventsMessages`/`parseEventsVerdict`) + events branch: `resolveOfficialDomain` (2-hop) → 80/20 domain filter → `passesPrizeGate` → admit (Phase 4 bucket) | divert (perk_hint → `drainLootRow`) | `prize_below_threshold` tombstone
- Vendor watchlist (`WATCHLIST` + `fetchAll`/`list`/`getLootCandidates`): CNCF/LF, AWS, Azure, GitHub Education, Oracle; html+rss modes; keyword signal layer; URL-deduped fan-out; never-throw entry isolation
- `candidateSources['loot']` wired into live scheduler deps in `registry-start.ts`
- `discord-router` exports added: `./link-hop`, `./prize-gate`, `./domain-filter`, `./portals/loot/*`

## Task Commits

Each task was committed atomically with TDD RED→GREEN→REFACTOR:

1. **Task 1: Loot vertical core — rule pack, gates, FAQ reader, and the drain loot branch** - `fb15044` (feat)
2. **Task 2: Events completion — full events rule pack + drain events branch with prize-gate divert into loot** - `10f5754` (feat)
3. **Task 3: Vendor watchlist source + live loot wiring + loot card tests** - `d5a5c02` (feat)

**Plan metadata:** `d5a5c02` (docs: complete plan pending)

## Files Created/Modified

- `packages/orchestrator/src/rule-packs/loot.ts` - loot rule pack: messages + zod verdict boundary
- `packages/orchestrator/src/gates/loot.ts` - deterministic loot gates (pure, enumerated reason codes)
- `packages/orchestrator/src/loot-faq.ts` - FAQ reader: 2-hop SSRF-guarded hop + sanitized fetch, capped 8000
- `packages/orchestrator/src/rule-packs/events.ts` - events rule pack: classification, scoring, prize extraction, perk hint
- `packages/orchestrator/src/orchestrator.ts` - drainLootRow + processEventsRow + pipeline dispatch in drainStep2Rows
- `packages/orchestrator/src/index.ts` - loot + events package exports
- `packages/orchestrator/vitest.config.ts` - aliases for link-hop/prize-gate/domain-filter/sanitize-fetch/scout
- `packages/orchestrator/package.json` - added @zod/discord-router/@zod/sanitize/@zod/scout deps
- `packages/orchestrator/tsconfig.json` - added discord-router/sanitize/scout references
- `packages/discord-router/package.json` - added ./link-hop, ./prize-gate, ./domain-filter, ./portals/loot/* exports
- `apps/scheduler/src/registry-start.ts` - candidateSources['loot'] wired into live deps
- Plus 10 matching test files (loot.test.ts, gates/loot.test.ts, loot-faq.test.ts, orchestrator.test.ts, events.test.ts, vendors.test.ts)

## Decisions Made

- `drainLootRow` exported as a named function so Task 2's events divert calls it directly — no logic duplication between the direct loot branch and the divert path.
- Event buckets reuse Phase 4 constants verbatim (`#🔥-priority-sys-cp-sec`, `#-online-1lakh-plus`) — no invented bucket strings.
- Domain-filter reject tombstones use the predicate's reason vocabulary verbatim (`non-technical` / `deep-tech-low-score`).
- Vendor watchlist uses `globalThis.fetch` + `validateUrl` (SSRF guard) + keyword layer; no cheerio/browser dependency needed for static vendor pages.

## Deviations from Plan

None - plan executed exactly as written. All three TDD tasks completed with their full test matrices, the build passes, and the full workspace suite (462 tests across 56 files) is green.

**Total deviations:** 0 auto-fixed
**Impact on plan:** N/A

## Issues Encountered

None - all tasks executed as planned with no blockers, deviations, or authentication gates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 05-04 is complete. The drain now has all three branches (jobs from 05-01, loot and events from 05-04). Plan 05-05 (dedup merger) can build on the completed drain. Threat mitigations T-05-19 through T-05-24 and T-05-SC are implemented (untrusted-data framing, SSRF-guarded 2-hop cap, verbatim tombstone reasons, no new dependencies).

---
*Phase: 05-jobs-loot-pipelines*
*Completed: 2026-10-16*
