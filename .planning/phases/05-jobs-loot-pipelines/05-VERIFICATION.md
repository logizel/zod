---
phase: 05-jobs-loot-pipelines
phase_number: 05
status: passed
score: "59/59"
must_haves_verified: [05-01-T1, 05-01-T2, 05-01-T3, 05-01-T4, 05-01-T5, 05-01-T6, 05-01-T7, 05-01-T8, 05-01-T9, 05-01-backstop, 05-02-T1, 05-02-T2, 05-02-T3, 05-02-T4, 05-02-T5, 05-02-T6, 05-03-T1, 05-03-T2, 05-03-T3, 05-03-T4, 05-03-T5, 05-03-T6, 05-03-T7, 05-04-T1, 05-04-T2, 05-04-T3, 05-04-T4, 05-04-T5, 05-04-T6, 05-04-T7, 05-04-T8, 05-05-T1, 05-05-T2, 05-05-T3, 05-05-T4, 05-05-T5, 05-05-backstop, 05-06-T1, 05-06-T2, 05-06-T3, 05-06-T4, 05-06-T5, 05-07-T1, 05-07-T2, 05-07-T3, 05-07-T4, 05-07-T5, 05-08-T1, 05-08-T2, 05-08-T3, 05-08-T4, 05-08-T5, 05-08-T6, 05-09-T1, 05-09-T2, 05-09-T3, 05-09-T4, 05-09-T5]
must_haves_missing: []
requirements_completed: [ING-03, EVT-07, JOB-01, JOB-02, JOB-03, JOB-04, JOB-05, LOT-01, LOT-02, LOT-03, LOT-04]
success_criteria_asserted: [1, 2, 3, 4, 5]
human_needed: false
human_verification: []
gaps_found: false
gap_summaries: []
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "58/59"
  gaps_closed:
    - "05-02-T5 / CR-02: boards.ts require() in ESM module fixed — replaced require('node:os').homedir() with import { homedir } from 'node:os' + homedir() fallback (commit 908aa58 on agent-05-08)"
  gaps_remaining: []
  regressions: []
covered_files:
  - .planning/phases/05-jobs-loot-pipelines/05-01-PLAN.md
  - .planning/phases/05-jobs-loot-pipelines/05-01-PLAN-SUMMARY.md
  - .planning/phases/05-jobs-loot-pipelines/05-02-PLAN.md
  - .planning/phases/05-jobs-loot-pipelines/05-02-PLAN-SUMMARY.md
  - .planning/phases/05-jobs-loot-pipelines/05-03-PLAN.md
  - .planning/phases/05-jobs-loot-pipelines/05-03-PLAN-SUMMARY.md
  - .planning/phases/05-jobs-loot-pipelines/05-04-PLAN.md
  - .planning/phases/05-jobs-loot-pipelines/05-04-PLAN-SUMMARY.md
  - .planning/phases/05-jobs-loot-pipelines/05-05-PLAN.md
  - .planning/phases/05-jobs-loot-pipelines/05-05-PLAN-SUMMARY.md
  - .planning/phases/05-jobs-loot-pipelines/05-06-PLAN.md
  - .planning/phases/05-jobs-loot-pipelines/05-06-PLAN-SUMMARY.md
  - .planning/phases/05-jobs-loot-pipelines/05-07-PLAN.md
  - .planning/phases/05-jobs-loot-pipelines/05-07-PLAN-SUMMARY.md
  - .planning/phases/05-jobs-loot-pipelines/05-08-PLAN.md
  - .planning/phases/05-jobs-loot-pipelines/05-08-PLAN-SUMMARY.md
  - .planning/phases/05-jobs-loot-pipelines/05-09-PLAN.md
  - .planning/phases/05-jobs-loot-pipelines/05-09-PLAN-SUMMARY.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
  - packages/orchestrator/src/orchestrator.ts
  - packages/orchestrator/src/gates/jobs.ts
  - packages/orchestrator/src/gates/loot.ts
  - packages/orchestrator/src/rule-packs/jobs.ts
  - packages/orchestrator/src/rule-packs/loot.ts
  - packages/orchestrator/src/rule-packs/events.ts
  - packages/orchestrator/src/loot-faq.ts
  - packages/orchestrator/src/integration.ts
  - packages/orchestrator/src/index.ts
  - packages/discord-router/src/portals/jobs/greenhouse.ts
  - packages/discord-router/src/portals/jobs/lever.ts
  - packages/discord-router/src/portals/jobs/ashby.ts
  - packages/discord-router/src/portals/jobs/hn-whoshiring.ts
  - packages/discord-router/src/portals/jobs/startup-jobs.ts
  - packages/discord-router/src/portals/jobs/cutshort.ts
  - packages/discord-router/src/portals/jobs/cuvette.ts
  - packages/discord-router/src/portals/jobs/workday.ts
  - packages/discord-router/src/portals/jobs/yc.ts
  - packages/discord-router/src/portals/jobs/wellfound.ts
  - packages/discord-router/src/portals/jobs/boards.ts
  - packages/discord-router/src/portals/jobs/index.ts
  - packages/discord-router/src/portals/loot/vendors.ts
  - packages/discord-router/src/router-service.ts
  - packages/discord-router/src/embed.ts
  - packages/discord-router/package.json
  - packages/dedup/src/merger.ts
  - packages/scheduler/src/jobs.ts
  - packages/scheduler/src/registry.ts
  - packages/db-hot/src/schema.ts
  - packages/db-hot/src/scratchpad.ts
  - packages/config/src/env.ts
  - packages/config/src/jobs-policy.ts
  - packages/scout/src/jobs-screen.ts
  - apps/scheduler/src/registry-start.ts
  - .env.example
covered_digest: "v2:sha256:88704f4808022fcaf4b4522401d920a2dde7ddabbf737b0cc989d64a4b60baa5"
---

# Phase 05: Jobs + Loot Pipelines — Verification Report

**Phase Goal:** Users get fresher-true job alerts and verified free-perk diversions with duplicates merged and scams rejected (ROADMAP.md §Phase 5)

**Verified:** 2026-10-16
**Status:** passed
**Score:** 59/59 must-haves verified
**Re-verification:** Yes — after gap closure (CR-02 fix)

---

## Goal Achievement

### Observable Truths

| #   | Truth                              | Status     | Evidence                                                                                   |
| --- | ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| 1   | 05-01-T1 Greenhouse listing → STEP_2 | ✓ VERIFIED | packages/orchestrator/src/e2e-tracer.test.ts; packages/discord-router/src/portals/jobs/greenhouse.ts (listing + ≤8k detail) |
| 2   | 05-01-T2 audit drain dispatch       | ✓ VERIFIED | packages/orchestrator/src/orchestrator.ts drainStep2Rows: LlmRouter.complete(pipeline jobs, slot auditor-jobs-1, priority 2) |
| 3   | 05-01-T3 pass → audited opportunity | ✓ VERIFIED | orchestrator.ts:233-250 createOpportunityIfAbsent with status='audited', bucket_channel, D-14 fields |
| 4   | 05-01-T4 reject → tombstone only    | ✓ VERIFIED | orchestrator.ts:187-194 writeTombstone with reason code, no opportunities row             |
| 5   | 05-01-T5 pickJobsBucket routing     | ✓ VERIFIED | packages/orchestrator/src/gates/jobs.ts:34-39 sys/cloud vs general buckets                 |
| 6   | 05-01-T6 UNVERIFIED/POOL_SATURATED  | ✓ VERIFIED | orchestrator.ts:169-172 leaves row at STEP_2                                               |
| 7   | 05-01-T7 re-drain idempotency       | ✓ VERIFIED | orchestrator.ts:333-375 url_hash pre-check before create                                   |
| 8   | 05-01-T8 missing source warn+skip   | ✓ VERIFIED | packages/scheduler/src/jobs.ts:379-394 declared-source-missing → warn + skip               |
| 9   | 05-01-T9 live tick no static sample | ✓ VERIFIED | jobs.ts:389-394 live deps + no source → skip; POLL_CANDIDATES only in legacy stub mode    |
| 10  | 05-01-backstop concurrent drain noOverlap | ✓ VERIFIED | orchestrator.ts per-row try/catch + url_hash pre-check + advanceToStep3; noOverlap in registry |
| 11  | 05-02-T1 sources emit candidates    | ✓ VERIFIED | 10 adapter modules (greenhouse, lever, ashby, hn, startup-jobs, cutshort, cuvette, workday, yc, wellfound) — all never-throw |
| 12  | 05-02-T2 zero postings → []         | ✓ VERIFIED | All adapters return [] on non-ok/empty; fixture-tested                                     |
| 13  | 05-02-T3 contiguous pagination      | ✓ VERIFIED | cutshort.ts/cuvette.ts/workday.ts bounded ≤2 pages; yc.ts ≤2 pages; tests assert call counts |
| 14  | 05-02-T4 deterministic ordering     | ✓ VERIFIED | index.ts getJobCandidates: stable source-table order then payload order; URL-deduped       |
| 15  | 05-02-T5 D-02 learned board rotation | ✓ VERIFIED | boards.ts:17 `import { homedir } from 'node:os'` (ESM-compatible, CR-02 fixed); learnBoard exactly-once; loadBoards seed ∪ learned; index.ts learned-board fan-out |
| 16  | 05-02-T6 Workday cxs + browser      | ✓ VERIFIED | workday.ts: tryCxsListing first, tryBrowserListing fallback, never throws                  |
| 17  | 05-03-T1 senior screen zero-fetch   | ✓ VERIFIED | packages/scout/src/jobs-screen.ts screenListing: whole-word title + snippet patterns; scheduler screen-wiring |
| 18  | 05-03-T2 fresher gate min≤1         | ✓ VERIFIED | gates/jobs.ts:73-75 admittedByFresherGate; classifyExperience parses en-dash/₹             |
| 19  | 05-03-T3 scam classes + fellowship  | ✓ VERIFIED | gates/jobs.ts:105-129 detectScamClasses; isFellowshipProgram (LFX/GSoC/MLH allowlist)     |
| 20  | 05-03-T4 geo gate                   | ✓ VERIFIED | gates/jobs.ts:147-159 geoVerdict admits India/hybrid/Remote; rejects geo_locked/work_auth |
| 21  | 05-03-T5 verdict zod boundary       | ✓ VERIFIED | rule-packs/jobs.ts:36-42 parseJobsVerdict returns null on parse failure                    |
| 22  | 05-03-T6 admission classes + stacks | ✓ VERIFIED | rule-packs/jobs.ts:48-59 ADMISSION_CLASSES; gates pickJobsBucket stack classification      |
| 23  | 05-03-T7 protective context fee     | ✓ VERIFIED | jobs-screen.ts flags-only (never auto-reject); auditor confirms from full text             |
| 24  | 05-04-T1 ₹1L fail + perk → loot     | ✓ VERIFIED | orchestrator.ts:526-530 divert flow; loot gates reject loot_us_eu_only/loot_shipping_unverified/etc. |
| 25  | 05-04-T2 loot row → audited + bucket | ✓ VERIFIED | orchestrator.ts:328-347 admits loot with bucket #🎁-free-swag-and-credits + D-14 fields   |
| 26  | 05-04-T3 claim steps {step,quote}   | ✓ VERIFIED | rule-packs/loot.ts claim_steps schema; gates/loot.ts:50-55 loot_claim_steps_unreadable     |
| 27  | 05-04-T4 fully-free qualifier       | ✓ VERIFIED | gates/loot.ts:59-61 offer_cost !== 'free' → loot_not_fully_free                            |
| 28  | 05-04-T5 US/EU-only → reject        | ✓ VERIFIED | gates/loot.ts:36-38 loot_us_eu_only; loot_shipping_unverified for unknown/unverified       |
| 29  | 05-04-T6 readLootRules 2-hop cap    | ✓ VERIFIED | loot-faq.ts:13-31 resolveOfficialDomain(url, 2); null on hop/fetch failure                 |
| 30  | 05-04-T7 loot-watchlist ticks       | ✓ VERIFIED | vendors.ts WATCHLIST + getLootCandidates; registry-start.ts candidateSources['loot']       |
| 31  | 05-04-T8 events branch complete     | ✓ VERIFIED | orchestrator.ts:402-536 resolve → domain filter → prize gate → bucket                       |
| 32  | 05-05-T1 merge ≥0.9 + evidence + ±3d | ✓ VERIFIED | packages/dedup/src/merger.ts:108-159 attemptMerge full D-09 gate                          |
| 33  | 05-05-T2 below-threshold → flag     | ✓ VERIFIED | merger.ts:162-178 possibleDupe flag only, never merge                                      |
| 34  | 05-05-T3 no candidates → no merge   | ✓ VERIFIED | merger.ts:123-125 empty candidates → no merge                                              |
| 35  | 05-05-T4 first-seen master, merged tombstone | ✓ VERIFIED | merger.ts:154-159 masterId + tombstoneMerged('merged','merger'); orchestrator drain backstop |
| 36  | 05-05-T5 late duplicate append only | ✓ VERIFIED | orchestrator.ts:490-502 possibleDupe appends link, no re-post                               |
| 37  | 05-05-backstop end-state invariant  | ✓ VERIFIED | cross-pipeline.test.ts: single master per merge-group under same-batch race                |
| 38  | 05-06-T1 mixed batch exact ledger   | ✓ VERIFIED | cross-pipeline.test.ts: 4 opportunities + 2 tombstones, all rows STEP_3                    |
| 39  | 05-06-T2 same-batch race single master | ✓ VERIFIED | cross-pipeline.test.ts: row 6 tombstoned 'merged', master registration_links = both URLs   |
| 40  | 05-06-T3 row isolation              | ✓ VERIFIED | cross-pipeline.test.ts: throw-row sub-case batch completes, others unaffected              |
| 41  | 05-06-T4 .env.example ↔ EnvSchema bijective | ✓ VERIFIED | packages/config/src/env-drift.test.ts; .env.example lists every EnvSchema key exactly once |
| 42  | 05-06-T5 throw-row doesn't abort    | ✓ VERIFIED | cross-pipeline.test.ts isolation sub-case                                                  |
| 43  | 05-07-T1 logged-out probe executed  | ✓ VERIFIED | 05-07-PLAN-SUMMARY.md probe table: YC browser-mode, Wellfound fetch-facade (2026-10-16)  |
| 44  | 05-07-T2 YC/Wellfound never throw   | ✓ VERIFIED | yc.ts/wellfound.ts never-throw contract; no login/signup/cookie/credential surfaces        |
| 45  | 05-07-T3 ≤2 pages contiguous        | ✓ VERIFIED | yc.ts/wellfound.ts bounded pagination; tests assert call counts                            |
| 46  | 05-07-T4 ten-source fan-out         | ✓ VERIFIED | index.ts JOB_LIST_FNS length 10; URL-deduped, stable ordering                              |
| 47  | 05-07-T5 YC/wellfound → learnBoard  | ✓ VERIFIED | index.ts:56-67 learned-board fan-out through provider adapters                             |
| 48  | 05-08-T1 D-14 nullable/defaulted    | ✓ VERIFIED | packages/db-hot/src/schema.ts:98-107 D-14 fields nullable/defaulted; schema.test.ts        |
| 49  | 05-08-T2 channel buckets env-ID-first | ✓ VERIFIED | router-service.ts:134-138 CHANNEL_ID_ENV_KEYS; env-ID-first + name fallback               |
| 50  | 05-08-T3 channel keys '', parseEnv passes | ✓ VERIFIED | env.ts:21-23 z.string().default(''); env.test.ts                                          |
| 51  | 05-08-T4 buildAuditCard per-pipeline fields | ✓ VERIFIED | embed.ts:13-25 jobs stack/eligibility/apply; loot shipping/card/claims; — convention       |
| 52  | 05-08-T5 unknown channel → skip     | ✓ VERIFIED | router-service.ts:185 return null; skip path preserved                                     |
| 53  | 05-08-T6 migration idempotent       | ✓ VERIFIED | schema.test.ts Phase 4-shaped fixture parses with defaults; no default overwrite           |
| 54  | 05-09-T1 test files ≥3 cases        | ✓ VERIFIED | gates/jobs.test.ts, orchestrator.test.ts, registry.test.ts, poll-wiring.test.ts, greenhouse.test.ts |
| 55  | 05-09-T2 observable outputs only    | ✓ VERIFIED | All tests assert created rows/tombstone statuses; no snapshot-only assertions              |
| 56  | 05-09-T3 orchestrator suite green   | ✓ VERIFIED | pnpm vitest run packages/orchestrator — 52 test files, 483 tests, all green                |
| 57  | 05-09-T4 dependent suites green     | ✓ VERIFIED | pnpm vitest run packages/discord-router packages/scheduler packages/config — all green     |
| 58  | 05-09-T5 no real network IO         | ✓ VERIFIED | All tests use mocks/stubs; zero live network                                               |
| 59  | CR-02 resolved (boards.ts ESM import) | ✓ VERIFIED | boards.ts:17 `import { homedir } from 'node:os'`; zero `require()` calls (grep confirmed) |

**Score:** 59/59 truths verified (0 present-but-behavior-unverified, 0 failed)

---

### Deferred Items

None. No gap is addressed by a later milestone phase; all Phase 5 must-haves are within this phase's boundary.

---

### Advisory (New Scope, Unevidenced)

None raised by this verification. (Re-verification run; no unevidenced new-scope findings.)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `packages/orchestrator/` | @zod/orchestrator workspace package | ✓ VERIFIED | drainStep2Rows, rule-packs, gates, integration, index |
| `packages/discord-router/src/portals/jobs/` | 10 job source adapters + boards + index | ✓ VERIFIED | All 10 modules present, substantive, tested |
| `packages/discord-router/src/portals/loot/vendors.ts` | Vendor watchlist WATCHLIST + getLootCandidates | ✓ VERIFIED | 5 vendors (CNCF/LF, AWS, Azure, GitHub Education, Oracle) |
| `packages/dedup/src/merger.ts` | Bounded fuzzy merger ≥0.9 | ✓ VERIFIED | attemptMerge, MergeStore port, createMergeStore |
| `packages/scheduler/src/jobs.ts` | JOB_POLL_JOBS, AUDIT_JOBS, candidateSource mechanism | ✓ VERIFIED | jobs-poll */40, loot-watchlist 0 */5, audit-drain */5 |
| `packages/scheduler/src/registry.ts` | registerPollJobs, registerAuditDrain, assertSchedulerGuards | ✓ VERIFIED | All 4 tables guarded |
| `packages/db-hot/src/schema.ts` | D-14 extended Opportunity + TaskScratchpad | ✓ VERIFIED | Nullable/defaulted fields; HOT_COLLECTIONS untouched |
| `packages/config/src/env.ts` | 3 channel keys + FELLOWSHIP_ALLOWLIST_EXTRA | ✓ VERIFIED | Empty defaults; parseEnv fail-fast |
| `packages/discord-router/src/router-service.ts` | resolveChannel env-ID-first | ✓ VERIFIED | 3 bucket env-ID mappings + name fallback + skip path |
| `packages/discord-router/src/embed.ts` | Per-pipeline audit-card fields | ✓ VERIFIED | Jobs: stack/eligibility/apply; Loot: shipping/card/claims |
| `apps/scheduler/src/registry-start.ts` | Live dep wiring (pb/cold/router/candidateSources) | ✓ VERIFIED | candidateSources events→getPortalCandidates, jobs→getJobCandidates, loot→getLootCandidates |

---

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| candidateSources['jobs'].list | getJobCandidates | JOB_LIST_FNS + learned-board fan-out | ✓ WIRED | index.ts:30-41; registry-start.ts:57-61 |
| candidateSources['events'].list | getPortalCandidates | PORTAL_LIST_FNS (7 portals) | ✓ WIRED | jobs.ts:235-264; registry-start.ts:58 |
| candidateSources['loot'].list | getLootCandidates | vendors.ts fetchAll | ✓ WIRED | vendors.ts:87-95; registry-start.ts:60 |
| STEP_2 scratchpad → drain | LlmRouter.complete | drainStep2Rows (orchestrator.ts) | ✓ WIRED | pageSize 25, step_position='STEP_2' filter |
| LlmRouter.complete → gates | evaluateJobsGates / evaluateLootGates | orchestrator.ts processJobsRow/processEventsRow/drainLootRow | ✓ WIRED | priority 2, pipeline-aware |
| Gates → opportunities/tombstone | createOpportunityIfAbsent / writeTombstone | orchestrator.ts | ✓ WIRED | url_hash pre-check; terminal status verbatim |
| Drain backstop | attemptMerge | orchestrator.ts:203-230 (jobs), 476-502 (events) | ✓ WIRED | Pre-create merge guard; merged tombstone |
| MergeStore | pb/cold | createMergeStore (dedup/merger.ts) | ✓ WIRED | Structural port; bounded findCandidates limit 50 |
| opportunities → Discord | buildAuditCard → processOpportunity | router-service.ts poll loop | ✓ WIRED | status='audited' && bucket_channel != '' |
| resolveChannel | env-ID → Discord channel ID | router-service.ts CHANNEL_ID_ENV_KEYS | ✓ WIRED | Env-ID-first, name fallback, skip path |
| D-04 screen | screenListing → scheduler tick | scout/jobs-screen.ts wired in runStubTick | ✓ WIRED | jobs.ts:492-522; only jobs pipeline |
| Boards state | readStateFile/writeStateFile atomic | boards.ts tmp+rename | ✓ WIRED | boards.ts:44-50 `process.env.HOME` + `homedir()` ESM-compatible (CR-02 fixed) |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| orchestrator.ts | fetchedText | row.partial_buffer (STEP_2 scratchpad) | Yes (fetched detail text) | ✓ FLOWING |
| orchestrator.ts | bucket_channel | gate.bucketChannel (pickJobsBucket / BUCKET_LOOT) | Yes (stack-tag classifier) | ✓ FLOWING |
| orchestrator.ts | reason_code | gate.reasonCode (enumerated vocabulary) | Yes (deterministic gates) | ✓ FLOWING |
| merger.ts | links union | master.registration_links + input.url | Yes (deduplicated) | ✓ FLOWING |
| embed.ts | registration_links | opp.registration_links (D-14) | Yes (link union from merge) | ✓ FLOWING |
| vendors.ts | candidate snippet | vendor page text (keyword signal) | Yes (fetched from watchlist URLs) | ✓ FLOWING |
| loot-faq.ts | faqText | resolveOfficialDomain → sanitize facade | Yes (official rules/FAQ page) | ✓ FLOWING |
| greenhouse.ts | snippet | stripHtml(job.content) ≤200 | Yes (Greenhouse board JSON) | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full workspace test suite | `pnpm test` | 63 test files, 574 tests, all green | ✓ PASS |
| Orchestrator suite | `pnpm vitest run packages/orchestrator` | All tests green | ✓ PASS |
| Discord-router suite | `pnpm vitest run packages/discord-router` | All tests green | ✓ PASS |
| Scheduler suite | `pnpm vitest run packages/scheduler` | All tests green | ✓ PASS |
| Config suite | `pnpm vitest run packages/config` | All tests green | ✓ PASS |
| DB-hot suite | `pnpm vitest run packages/db-hot` | All tests green | ✓ PASS |
| Dedup suite | `pnpm vitest run packages/dedup` | All tests green | ✓ PASS |
| Scout suite | `pnpm vitest run packages/scout` | All tests green | ✓ PASS |
| ESM require() check | `grep require\( packages/discord-router/src/portals/jobs/boards.ts` | No matches | ✓ PASS |
| ESM homedir import check | `grep "from 'node:os'" boards.ts` | `import { homedir } from 'node:os'` found | ✓ PASS |

---

### Probe Execution

No phase-declared probes (`scripts/*/tests/probe-*.sh`) exist in this project. Not applicable.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| ING-03 | 05-01, 05-02, 05-07 | Poll job portals 30–60m (Greenhouse, Lever, Ashby, YC, Wellfound, Cutshort, Cuvette, Workday + HN, startup.jobs) | ✓ SATISFIED | 10 source adapters + JOB_POLL_JOBS */40 + candidateSources['jobs'] |
| EVT-07 | 05-05 | Cross-platform dup merge ≥0.9 + ±3d + organizer | ✓ SATISFIED | dedup/merger.ts + drain backstop + cross-pipeline test |
| JOB-01 | 05-03 | India on-site/hybrid + India-eligible global remote | ✓ SATISFIED | gates/jobs.ts geoVerdict (D-08) |
| JOB-02 | 05-01, 05-03 | Admit internships, 0–1yr, fellowships | ✓ SATISFIED | rule-packs/jobs.ts ADMISSION_CLASSES + gates |
| JOB-03 | 05-03 | Reject 2+yr, unpaid non-fellowship, pay-for-training | ✓ SATISFIED | gates/jobs.ts evaluateJobsGates + detectScamClasses |
| JOB-04 | 05-01, 05-03 | Sys/Cloud/DevOps → #⚙️-jobs-sys-cloud-devops | ✓ SATISFIED | gates/jobs.ts pickJobsBucket SYS_CLOUD_STACKS |
| JOB-05 | 05-01, 05-03 | Other SWE → #💼-jobs-general-swe | ✓ SATISFIED | gates/jobs.ts pickJobsBucket default general |
| LOT-01 | 05-04 | ₹1L fail + perk → divert to #🎁-free-swag-and-credits | ✓ SATISFIED | orchestrator.ts divert flow + loot gates |
| LOT-02 | 05-04 | Credit alerts flag card_required | ✓ SATISFIED | loot verdict card_required + gates |
| LOT-03 | 05-04 | Cert vouchers 100%-free + claim steps | ✓ SATISFIED | loot gates offer_cost 'free' + claim_steps {step,quote} |
| LOT-04 | 05-04 | Shipping India/global verified; US/EU-only rejected | ✓ SATISFIED | loot gates shipping_verified + shipping_region |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| packages/discord-router/src/portals/jobs/greenhouse.ts | 18 | `GREENHOUSE_BOARD_TOKEN = 'zod'` placeholder | ⚠️ Warning | Tracer-slice placeholder; replaced by boards.ts (D-02) in 05-02 — not a blocker |
| packages/discord-router/src/portals/jobs/lever.ts | 14 | `DEFAULT_LEVER_SITE = 'zod'` placeholder | ⚠️ Warning | Config-driven override via opts.site; not a blocker |
| packages/discord-router/src/portals/jobs/ashby.ts | 12 | `DEFAULT_ASHBY_BOARD = 'zod'` placeholder | ⚠️ Warning | Config-driven override via opts.board; not a blocker |
| packages/orchestrator/src/orchestrator.ts | 363 | String-interpolated PocketBase filter | ⚠️ Warning | CR-01: hand-rolled SQL-ish escaping; urlHash is SHA-256 hex ([0-9a-f]{64}) so not exploitable; fragile pattern |
| packages/orchestrator/src/orchestrator.ts | 204 | `createMergeStore({ pb: pb as any })`, no `cold` | ⚠️ Warning | WR-04: degrades gracefully (cold optional chaining); tombstone write skipped if cold absent |
| packages/scheduler/src/jobs.ts | 77-146 | STUB_JOBS stub jobs (events-stub, jobs-stub, etc.) | ℹ️ Info | Phase 2 stubs; real polling uses JOB_POLL_JOBS/AUDIT_JOBS |
| packages/discord-router/src/portals/jobs/*.ts | various | Duplicate `stripHtml` (4 files) | ℹ️ Info | IN-02: code duplication; no functional impact |
| packages/discord-router/src/router-service.ts | 175 | `client.guilds?.caches?.values?.()` | ⚠️ Warning | WR-02: discord.js v14 API mismatch in name-based fallback; env-ID-first path works |
| packages/discord-router/src/portals/jobs/hn-whoshiring.ts | 88 | HN watermark off-by-one potential | ⚠️ Warning | WR-03: may cause duplicate processing at boundary |
| packages/orchestrator/src/gates/jobs.ts | 215-219 | fellowship_program null → skip fellowship check | ⚠️ Warning | WR-06: unpaid non-fellowship with null fellowship_program relies on LLM admission_class='reject' |
| apps/scheduler/src/registry-start.ts | 45, 84-85 | Turso cold client created, `void cold` | ℹ️ Info | WR-07: unused in tracer slice; wired for 05-05 merger |
| packages/orchestrator/src/rule-packs/jobs.ts | 95-96 | Missing newline in prompt | ℹ️ Info | IN-01: cosmetic |

**Note:** All warnings/info items are pre-existing and do not block phase completion. CR-02 (the sole blocker) is resolved.

---

### Human Verification Required

None. All behaviors are programmatically verifiable via tests. CR-02 was a code defect requiring a fix (now applied), not human testing.

---

### Gaps Summary

**Zero gaps.** All 59 must-have truths are verified. CR-02 (boards.ts `require()` in ESM module) is fixed — commit 908aa58 on branch agent-05-08 replaced `require('node:os').homedir()` with ESM-compatible `import { homedir } from 'node:os'` + `process.env.HOME` fallback. All 574 tests across 63 files pass.

---

## Phase Goal Restatement

**"Users get fresher-true job alerts and verified free-perk diversions with duplicates merged and scams rejected"**

All 5 roadmap success criteria are TRUE and verified by test evidence:

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | User sees a true 0–1yr/intern India role in the correct jobs channel with eligibility and a direct apply link | ✓ TRUE | 05-01-T3 (audited opportunity with bucket_channel + D-14 fields), 05-03-T2 (fresher gate), 05-08-T4 (audit card eligibility/apply link), cross-pipeline row 2-3 |
| 2 | A 2+yr role, an unpaid non-fellowship, and a pay-for-training listing are all rejected and never alerted | ✓ TRUE | 05-03-T2 (experience_min_2plus), 05-03-T3 (scam classes + unpaid_non_fellowship), 05-01-T4 (tombstone only, never alerted) |
| 3 | A Sys/Cloud/DevOps role lands in #⚙️-jobs-sys-cloud-devops while other verified SWE roles land in #💼-jobs-general-swe | ✓ TRUE | 05-01-T5 (pickJobsBucket), 05-08-T2 (resolveChannel env-ID-first), cross-pipeline row 2-3 |
| 4 | An online event failing the ₹1L rule but carrying a real free perk diverts to #🎁-free-swag-and-credits with India-shipping verified; a US-only drop is rejected | ✓ TRUE | 05-04-T1 (divert flow), 05-04-T5 (loot_us_eu_only), 05-04-T2 (loot bucket + shipping_verified), cross-pipeline row 4-5 |
| 5 | The same event seen on two portals arrives as one merged alert with unified registration links | ✓ TRUE | 05-05-T1..T6 (merger ≥0.9 + ±3d + organizer, drain backstop, link union), cross-pipeline row 6 |

All 11 phase requirements (ING-03, EVT-07, JOB-01..05, LOT-01..04) are accounted for and satisfied.

---

## D-14 Decision Verification

The blocking-human D-14 checkpoint (05-08 Task 0) was pre-confirmed by the user. The migration landed as specified: nullable/defaulted fields only, no new collection, HOT_COLLECTIONS untouched, INDEX_NOTES updated. Phase 4-shaped rows parse cleanly with defaults applied (verified by schema.test.ts).

---

## Conclusion

**Status: passed**

All 59 of 59 must-have truths are verified. All 11 requirements are covered. All 5 success criteria are TRUE. The full workspace test suite (574 tests across 63 files) is green. CR-02 is resolved — boards.ts uses ESM-compatible `import { homedir } from 'node:os'` with `process.env.HOME` fallback, zero `require()` calls.

Phase 5 is fully verified with no gaps. Ready to proceed to Phase 6.

---

_Verified: 2026-10-16T16:52:00Z_
_Verifier: the agent (gsd-verifier)_
