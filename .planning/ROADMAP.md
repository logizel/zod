# Roadmap: Zod

## Overview

Zod builds as MVP vertical slices over a load-bearing foundation: provision the Oracle VM with hot/cold memory and reclaim defense (Phase 1), establish the fetch-and-filter contract (Phase 2), harden the LLM gateway (Phase 3), then prove the first end-to-end verified Discord alert on national event portals (Phase 4) before multiplying into jobs/loot pipelines (Phase 5), local/social coverage plus full routing polish (Phase 6), and the locked telemetry dashboard with ops hardening (Phase 7).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Oracle VM, hot/cold memory, tunnel, scheduler skeleton with reclaim defense
- [x] **Phase 2: Scraper Foundation** - Shared browser queue, sanitizer, Scout filter, scratchpad state (completed 2026-10-15)
- [x] **Phase 3: LLM Swarm** - Gateway router with 2D buckets, baton-pass, length-stitch, chaos tests (completed 2026-10-15)
- [x] **Phase 4: Events Vertical Slice** - First end-to-end verified event alert in Discord (completed 2026-10-16)
- [x] **Phase 5: Jobs + Loot Pipelines** - ATS polling, fresher/scam gates, loot verification, dedup hardening
- [ ] **Phase 6: Delivery + Local/Social Coverage** - Full 10-channel routing, reminders, DK/Udupi, relay, X/LinkedIn
- [ ] **Phase 7: Telemetry Dashboard + Ops Hardening** - Locked SSE dashboard, health grid, GC verification, kill-tests

## Phase Details

### Phase 1: Foundation

**Goal**: The system has a surviving home — provisioned VM, live databases, closed network, and a scheduler that cannot stampede
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: MEM-01, MEM-02, MEM-03, OPS-01
**Success Criteria** (what must be TRUE):
  1. Operator runs one documented rebuild command and gets a working VM with PocketBase and Turso schemas back
  2. Opportunities and telemetry records written locally also survive a simulated VM wipe via the off-server cold ledger
  3. No inbound firewall port is open, yet the operator reaches the locked dashboard shell through Zero Trust
  4. Scheduler polls run without overlapping executions and every secret lives in env, never in git history

**Plans**: 4/4 plans executed

Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Tracer boot slice: monorepo scaffold, env gate, redacting logger, hygiene

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02-PLAN.md — Memory contract: hot schemas plus cold ledger plus fingerprint precheck
- [x] 01-03-PLAN.md — Scheduler plus reclaim defense: guarded stub jobs, overlap proof, buffer plus watchdog

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-04-PLAN.md — Closed network plus rebuild proof: locked shell, tunnel units, rebuild plus drills

### Phase 2: Scraper Foundation

**Goal**: Any candidate URL becomes cheap, clean markdown with spam filtered and work-state tracked before any LLM is spent
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: ING-06, SWM-01, SWM-03
**Success Criteria** (what must be TRUE):
  1. A JS-gated event page resolves to capped markdown through the shared browser without opening more than 3 tabs
  2. Sanitized payloads measure ≥85% smaller than raw HTML on representative sources
  3. Expired and obvious-spam items are rejected from titles/snippets before any scrape happens
  4. Every candidate URL carries a persistent Task_Scratchpad that resumes its STEP_1..STEP_4 position after a crash

**Plans**: 3/3 plans complete

Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Tracer: end-to-end Jina-first fetch-and-filter slice (Scout → STEP_1 → Jina → sanitize → STEP_2)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — Expansion: browser queue + fail-signal routing + byte-proof + Scout depth + scratchpad resilience

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03-PLAN.md — Integration: scheduler poll wiring + 24h browser soak + full suite verification

### Phase 3: LLM Swarm

**Goal**: Auditors get reliable model answers despite free-tier quota walls — failures hand off, never re-scrape
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SWM-04, SWM-05, SWM-06
**Success Criteria** (what must be TRUE):
  1. A forced 429 mid-audit cools that model bucket for 60s and completes the audit on the next bucket with zero re-scraping
  2. A forced length-cutoff audit is stitched via continuation into one complete JSON verdict
  3. No autonomous traffic reaches Cerebras (disabled by default) and Tier2 overflow engages only after Tier1 buckets exhaust
  4. Operator can see per-bucket state (READY / 60s-COOLDOWN / DAILY-CAP) from gateway telemetry

**Plans**: TBD
- [x] 03-01-PLAN.md
- [x] 03-02-PLAN.md
- [x] 03-03-PLAN.md

### Phase 4: Events Vertical Slice

**Goal**: The first verified, deduplicated high-signal event alert lands in Discord with an official source link
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: ING-01, SWM-02, EVT-01, EVT-02, EVT-05, UI-01
**Success Criteria** (what must be TRUE):
  1. User sees audit cards for national-portal events in Discord with title, organizer, dates, prize breakdown, merged links, and a 1-line audit
  2. An online event with verified liquid cash ≥₹1,00,000 appears in #💻-online-1lakh-plus while a credit-inflated "₹5L prize" does not
  3. A Sys/CP/Sec event fast-tracks to #🔥-priority-sys-cp-sec after its legitimacy check
  4. An aggregator link resolves through to the official event domain within 2 hops before any verdict is posted
  5. A non-technical business event is rejected by the 80/20 domain filter and never reaches a channel

**Plans**: 3/3

**Wave 1**
- [x] 04-01-PLAN.md — Tracer: discord-router package + CTFtime → Scout → Link-Hopper → 80/20 → prize gate → auditor → Discord embed → routed (all 6 requirements covered in tracer path)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 04-02-PLAN.md — Six remaining portal adapters (unstop, devfolio, devpost, luma, meetup, clist) + staggered 7-portal cron via single scheduler registry

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 04-03-PLAN.md — Live Discord gateway login + channel resolution + router service poll loop (audited→routed) + router-service tests + .env.example

**UI hint**: yes

### Phase 5: Jobs + Loot Pipelines

**Goal**: Users get fresher-true job alerts and verified free-perk diversions with duplicates merged and scams rejected
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: ING-03, EVT-07, JOB-01, JOB-02, JOB-03, JOB-04, JOB-05, LOT-01, LOT-02, LOT-03, LOT-04
**Success Criteria** (what must be TRUE):
  1. User sees a true 0–1yr/intern India role in the correct jobs channel with eligibility and a direct apply link
  2. A 2+yr role, an unpaid non-fellowship, and a pay-for-training listing are all rejected and never alerted
  3. A Sys/Cloud/DevOps role lands in #⚙️-jobs-sys-cloud-devops while other verified SWE roles land in #💼-jobs-general-swe
  4. An online event failing the ₹1L rule but carrying a real free perk diverts to #🎁-free-swag-and-credits with India-shipping verified; a US-only drop is rejected
  5. The same event seen on two portals arrives as one merged alert with unified registration links

**Plans**: 9 plans

**Wave 1**
- [x] 05-08-PLAN.md — Contract foundations: D-14 one-way schema migration + new-channel env keys + resolveChannel env-ID-first + per-pipeline audit-card fields (blocking-human D-14 checkpoint) (JOB-02, JOB-04, JOB-05, LOT-01..04)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 05-01-PLAN.md — Tracer: @zod/orchestrator + Greenhouse → jobs tick → STEP_2 → audit drain → opportunities/tombstone; scheduler tables; live dependency wiring (ING-03, JOB-01..05)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 05-02-PLAN.md — Full job source mix: Lever/Ashby/HN Who-is-hiring/startup.jobs/Cutshort/Cuvette/Workday + D-02 seed & auto-learn board rotation (ING-03)
- [x] 05-03-PLAN.md — D-04 senior listing screen + full D-05..D-08 fresher/scam/geo gates + JOB-02 admission-class rule pack (JOB-01..05)
- [ ] 05-04-PLAN.md — Loot vertical: rule pack + gates + 2-hop FAQ reader + divert; events drain branch completion; vendor watchlist (LOT-01..04)

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 05-05-PLAN.md — EVT-07 fuzzy merger: ≥0.9/±3d/organizer gate, intake skip + drain backstop, merged tombstones, link union (EVT-07)
- [ ] 05-07-PLAN.md — YC + Wellfound browser-mode sources: logged-out accessibility probe + two logged-out listing adapters into the jobs fan-out (ING-03)

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 05-06-PLAN.md — Cross-pipeline drain ledger + .env.example bijection guard + full-suite phase gate (all 11 requirements)
- [ ] 05-09-PLAN.md — Unit + wiring coverage for gates, registry tables, tick sources, and Greenhouse adapter (dependent companion to 05-01, keeps 05-01's file concentration within the proven envelope) (ING-03, JOB-04, JOB-05)

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

**Plans**: TBD
**UI hint**: yes

### Phase 7: Telemetry Dashboard + Ops Hardening

**Goal**: The owner watches the whole swarm live on a locked read-only dashboard that survives tunnel and VM failures
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: DSH-01, DSH-02, DSH-03, DSH-04, MEM-05
**Success Criteria** (what must be TRUE):
  1. Owner opens the dashboard and sees rolling agent slots with live micro-step tickers including 429 baton-passes
  2. Owner sees the 2D pool health grid (READY/ACTIVE/60s-COOLDOWN/DAILY-CAP) and filterable read-only opportunity, TBA, and audit/rejection boards
  3. An unauthenticated request to the dashboard or its SSE stream is rejected before anything renders
  4. Killing cloudflared leaves pipelines running with alerts queued, and heavy text is purged on schedule while tombstones and taste rules survive

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete    | 2026-10-15 |
| 2. Scraper Foundation | 3/3 | Complete    | 2026-10-15 |
| 3. LLM Swarm | 3/3 | Complete    | 2026-10-15 |
| 4. Events Vertical Slice | 3/3 | Complete    | 2026-10-16 |
| 5. Jobs + Loot Pipelines | 4/9 | Executing | 2026-10-16 |
| 6. Delivery + Local/Social Coverage | 0/TBD | Not started | - |
| 7. Telemetry Dashboard + Ops Hardening | 0/TBD | Not started | - |
