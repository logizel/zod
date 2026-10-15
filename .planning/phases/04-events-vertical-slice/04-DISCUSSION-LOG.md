# Phase 4: Events Vertical Slice - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16
**Phase:** 4-Events Vertical Slice
**Areas discussed:** Portal adapter coverage & polling order (ING-01), Link-Hopper 2-hop resolution placement & semantics (SWM-02), Audit card content & channel mapping (UI-01), Prize verification standard & 80/20 legitimacy (EVT-05/EVT-02)

---

## Portal adapter coverage & polling order (ING-01)

### Q: Which national event portals to wire first for ING-01 (15–30m poll), and what adapter shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Unstop + Devfolio first | Shared RSS/JSON fetch shape. Recommended — India-native fresher portals matching the mission; avoids per-portal duplication. | |
| All 7 portals at once | Dedicated parser per portal — broader day-one coverage, more code. | ✓ |
| You decide | Researcher/planner picks coverage and adapter shape. | |

**User's choice:** All 7 portals at once with a dedicated parser per portal
**Notes:** Staggered polls across the 15–30m window (chosen below) to avoid thundering-herd on the shared 2-tab browser + Jina rate limits.

### Q: How should the 7 portals' 15–30m polls be timed — simultaneously or staggered across the window?

| Option | Description | Selected |
|--------|-------------|----------|
| Staggered across window | Recommended — spreads load on the shared 2-tab browser + Jina rate limits; respects Oracle ARM 2.5GB RAM budget. | ✓ |
| All 7 simultaneously | Simplest scheduling, but risks head-of-line block and Jina/provider rate-limit pileups. | |
| You decide | Scheduler researcher picks the timing model. | |

**User's choice:** Staggered across window
**Notes:** Cron offsets per portal; registered through the single scheduler registry (no scattered setInterval).

### Q: Should the portal adapter extract title+snippet for Scout pre-filter before any full fetch (RSS/JSON listing first), or fetch the full page first?

| Option | Description | Selected |
|--------|-------------|----------|
| RSS/JSON listing first | Recommended — extract title+snippet, run Scout pre-filter, full fetch only for survivors. Matches RSS-before-headless cost rule; Scout runs before any scrape (Phase 2 D-19). | ✓ |
| Fetch full page first | Simpler flow but spends fetch budget on items Scout would reject. | |
| You decide | Researcher/planner picks the adapter→Scout ordering. | |

**User's choice:** RSS/JSON listing first — extract title+snippet, Scout pre-filter, full fetch only for survivors
**Notes:** Scout pre-filter (expiry + spam, zero feed) runs on the listing title/snippet before any full fetch.

---

## Link-Hopper 2-hop resolution placement & semantics (SWM-02)

### Q: Should Link-Hopper resolve aggregator→official domain BEFORE or AFTER the auditor posts its verdict, and what counts as a 'hop'?

| Option | Description | Selected |
|--------|-------------|----------|
| Before auditor verdict | Recommended — success criterion #4: aggregator resolves to official domain within 2 hops before any verdict is posted; Link-Hopper feeds the auditor the official URL. | ✓ |
| After auditor verdict | Auditor sees aggregator URL first; Link-Hopper post-processes to official domain afterward. | |
| You decide | Researcher/planner picks Link-Hopper placement in the STEP machine. | |

**User's choice:** Before auditor verdict; hop resolved via HTTP redirect following
**Notes:** Hop 1 = aggregator/social page, hop 2 = official event domain.

### Q: What counts as hop 1 vs hop 2 in the 2-hop resolution — HTTP redirect following, or browser-rendered card?

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP redirect following | Recommended — hop 1 = aggregator/social page, hop 2 = official event domain via redirect chain; lightweight, no shared-browser cost (1 shared browser, max 2–3 tabs). | ✓ |
| Browser-rendered card | Hop 2 resolved by rendering the aggregator page in the shared headless browser; handles JS-gated cards but consumes browser tabs. | |
| You decide | Researcher/planner picks the hop-resolution mechanism. | |

**User's choice:** HTTP redirect following — hop 1 = aggregator/social page, hop 2 = official event domain
**Notes:** No Link-Hopper code exists yet; to be built in Phase 4.

### Q: When Link-Hopper fails to resolve to an official domain within 2 hops, what happens to the candidate?

| Option | Description | Selected |
|--------|-------------|----------|
| Tombstone as link_hop_failed, skip candidate | Recommended — protects the core value that every alert links the official source; candidate tombstoned (recordFailure → tombstone after 5 retries). | ✓ |
| Route with aggregator URL as-is, flag unverified | Keeps coverage but weakens the official-source guarantee; audit card marks link unverified. | |
| You decide | Researcher/planner picks failure handling. | |

**User's choice:** Tombstone as link_hop_failed, skip candidate
**Notes:** Hard max 2 hops (Feed → Aggregator → Official/ATS).

---

## Audit card content & channel mapping (UI-01)

### Q: Beyond the two rule-specific channels (#🔥-priority-sys-cp-sec for Sys/CP/Sec, #💻-online-1lakh-plus for ≥₹1L online), where do remaining verified events route in Phase 4?

| Option | Description | Selected |
|--------|-------------|----------|
| Catch-all #📋-events-general channel | Recommended — Phase 4 scope; keeps the two rule-specific channels for their criteria; other 10-matrix channels (local, travel, TBA, loot, jobs) deferred to Phase 5/6. | ✓ |
| Drop remaining verified events | Only alert the two rule-matched categories; stricter but fewer Phase 4 alerts. | |
| You decide | Researcher/planner picks Phase 4 channel mapping. | |

**User's choice:** Catch-all #📋-events-general channel for remaining verified events
**Notes:** Other 10-matrix channels (local, travel, TBA, loot, jobs) are Phase 5/6 scope, not Phase 4.

### Q: What fields and format should the Discord audit card contain (UI-01)?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured embed per UI-01 spec | Recommended — title, organizer, dates, prize breakdown (cash vs credits stripped), merged links [official + aggregator], 1-line audit from audit_summary; all fields already exist on the Opportunity schema. | ✓ |
| Minimal card: title + official link only | Simpler but under-serves the UI-01 audit-card contract. | |
| You decide | Researcher/planner picks the embed field set. | |

**User's choice:** Structured embed per UI-01 spec — title, organizer, dates, prize breakdown (cash vs credits stripped), merged links [official + aggregator], 1-line audit from audit_summary
**Notes:** Bot entry (apps/bot/src/index.ts) is a skeleton with no discord.js gateway/intents/embeds yet; gateway wiring lands in Phase 4/6.

### Q: How should audit cards be posted to Discord — a dedicated router service or inline in the auditor/curator step?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Discord router service | Recommended — polls opportunities with status='audited' + bucket_channel, posts embed, marks status='routed'; single Discord writer keeps the audit trail clean and matches the 'manual dashboard mutations out of scope' principle. | ✓ |
| Inline in auditor/curator step | Simpler but couples audit verdicts to Discord posting; harder to retry failed posts independently. | |
| You decide | Researcher/planner picks the posting architecture. | |

**User's choice:** Dedicated Discord router service — polls opportunities with status='audited' + bucket_channel, posts embed, marks status='routed'
**Notes:** No DISCORD_TOKEN exists in packages/config/src/env.ts yet — add before the Discord router constructs.

---

## Prize verification standard & 80/20 legitimacy (EVT-05/EVT-02)

### Q: What counts as 'verified liquid cash ≥₹1L' for EVT-05, and how are credits/vouchers handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit INR stated; credits/vouchers stripped; TBA=null does not qualify | Recommended — matches EVT-05 exactly ('verified liquid cash ≥₹1,00,000 INR (credits/vouchers/certificates stripped)'); prize_cash_inr is null while TBA/unverified per schema; credit-inflated '₹5L prize' must not appear (success criterion #2). | ✓ |
| Inferred prize qualifies | Weaker — risks credit-inflated alerts reaching #💻-online-1lakh-plus, contradicting success criterion #2. | |
| You decide | Researcher/planner picks the prize verification bar. | |

**User's choice:** Explicit INR stated; credits/vouchers stripped; TBA=null does not qualify
**Notes:** EVT-02 80/20 interacts with prize rules; both evaluated before the auditor (see below).

### Q: Where does the 80/20 domain filter sit vs the auditor verdict, and how is it scored (organizer≥9, agenda≥9)?

| Option | Description | Selected |
|--------|-------------|----------|
| 80/20 before auditor (cheap pre-filter) | Recommended — admit all SWE domains, adjacent deep-tech only at organizer≥9 AND agenda≥9, reject non-technical business before LLM spend; auditor scores survivors only (matches EVT-02; success criterion #5: non-technical business never reaches a channel). | ✓ |
| Auditor applies 80/20 in its verdict | Couples domain filtering to the LLM; more expensive per candidate. | |
| You decide | Researcher/planner picks 80/20 placement and scoring. | |

**User's choice:** 80/20 before auditor (cheap pre-filter) — admit all SWE domains, adjacent deep-tech only at organizer≥9 AND agenda≥9, reject non-technical business before LLM spend
**Notes:** Cheap pre-filter before any LLM spend; threshold values organizer≥9 / agenda≥9 are locked, scoring formula flexible.

---

## the agent's Discretion

No "you decide" selections — the user chose a concrete option for every area discussed. Researcher/planner have flexibility on: exact per-portal parser implementation (RSS vs JSON shape per portal), exact cheerio strip selector list, stagger interval math within the 15–30m window, exact 80/20 scoring formula (thresholds organizer≥9 / agenda≥9 are locked), Discord embed styling/colors, and the router service poll interval — as long as the locked decisions in CONTEXT.md and the Phase 4 success criteria hold.

---

## Deferred Ideas

None — discussion stayed within phase scope. No scope creep raised; no todos folded (todo match count 0).
