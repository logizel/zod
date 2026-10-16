# Phase 5: Jobs + Loot Pipelines - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16
**Phase:** 5-Jobs + Loot Pipelines
**Areas discussed:** ATS source mix, Fresher gate boundary, Duplicate merge policy, Loot sources & depth

---

## ATS source mix

### Q1: Which source mix should Phase 5 build first for job discovery (30–60m cadence)?

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid broad (Recommended) | Curated Greenhouse/Lever/Ashby JSON boards + aggregators (YC WaaS, Wellfound, Cutshort, Cuvette) + HN "Who is hiring?" via Algolia; gates before spend | ✓ |
| ATS boards only | Curated company list only; highest precision, limited coverage | |
| Aggregators + HN first | Discovery breadth first; noisier, browser fallback needs | |

**User's choice:** Hybrid broad
**Notes:** User explicitly added freeform context before discussion: "use other sites like yc startups hackernews etc etc also" — broadening beyond the enumerated portals was a stated want.

### Q2: How should the company ATS-board list grow over time?

| Option | Description | Selected |
|--------|-------------|----------|
| Seed + auto-learn (Recommended) | Static seed list; cross-linked ATS boards auto-join the rotation; deny-list later | ✓ |
| Seed list only | No auto-learning; manual additions only | |
| Seed + approve-to-add | Learned boards wait in a review queue | |

**User's choice:** Seed + auto-learn

### Q3: Workday is listed in PROJECT.md but not ING-03, and it needs headless rendering. Ship it in Phase 5?

| Option | Description | Selected |
|--------|-------------|----------|
| Defer Workday (Recommended) | JS-walled, shares 2–3 tab budget; revisit later | |
| Include via headless | Ship now via shared browser; accepts browser budget pressure | ✓ |
| JSON-first fallback | Try Workday cxs JSON endpoints first, headless fallback | |

**User's choice:** Include Workday (via shared headless browser)
**Notes:** User overrode the recommendation — Workday explicitly wanted in Phase 5.

### Q4: Should obviously-senior roles be rejected at the listing stage (zero fetch)?

| Option | Description | Selected |
|--------|-------------|----------|
| Title+text screen (Recommended) | Reject unambiguous senior markers only; borderline titles still audited | ✓ |
| Snippet-only screen | Only explicit minimum-experience strings reject | |
| Fetch-all + audit gate | Every listing fetched + audited; highest cost | |

**User's choice:** Title+text screen

---

## Fresher gate boundary

### Q1: How should the fresher gate treat ambiguous experience requirements?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimum≤1 rule (Recommended) | Reject only stated minimum 2+; admit 0–2/unstated; auditor still reads full text | ✓ |
| Explicit 0–1 only | Admit only explicit fresher signals; 0–2/unstated flag-only | |
| LLM case-by-case | Auditor judges each case; least deterministic | |

**User's choice:** Minimum≤1 rule

### Q2: How should 'unpaid non-fellowship' rejection be enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Fellowship allowlist (Recommended) | Unpaid rejects unless matching known program allowlist; reason code unpaid_non_fellowship | ✓ |
| Signal-based | Reject 'unpaid' lacking stipend/scholarship/fellowship language | |
| LLM judgment | Auditor judges legitimacy of unpaid structure | |

**User's choice:** Fellowship allowlist

### Q3: Which scam rejection stance should the jobs pipeline use?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-reject set (Recommended) | Deterministic reason-coded rejects: fees, deposits, pay-to-join, Telegram-only, anonymous, earn-spam; logged-not-alerted | ✓ |
| Fee-only minimal | Only explicit money-request language rejects | |
| LLM scam screen | Auditor verdict is authority; detectors only pre-flag | |

**User's choice:** Hard-reject set

### Q4: How should India eligibility be decided for remote roles?

| Option | Description | Selected |
|--------|-------------|----------|
| India-eligible wide (Recommended) | India + worldwide admitted; geo-locked/work-auth rejected | ✓ |
| Strict India-explicit | Only explicit India; worldwide flag-only | |
| LLM case-by-case | Auditor judges visa/geo from text | |

**User's choice:** India-eligible wide

---

## Duplicate merge policy

### Q1: When should two cross-portal sightings merge into one alert vs stay separate?

| Option | Description | Selected |
|--------|-------------|----------|
| High-conf auto-merge (Recommended) | ≥~0.9 similarity + ±3d + organizer/company; weaker pairs flagged, never merged | ✓ |
| Flag-don't-merge | No auto-merge until labeled eval; both alerts proceed flagged | |
| Auto-merge medium | Merge at ≥~0.8; higher false-merge risk | |

**User's choice:** High-conf auto-merge
**Notes:** Threshold tunable later via labeled eval (research guardrail honored: no medium-threshold auto-merge).

### Q2: When in the pipeline should merging happen, and which record wins as master?

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-audit merge (Recommended) | Merge before auditor; first-seen master; late dupes append links only | ✓ |
| At-routing merge | Independent audits; first-to-audit master; dupe audits burn tokens | |
| Both stages | Listing-stage + routing-stage sweep; more state to test | |

**User's choice:** Pre-audit merge

### Q3: Which pipelines does the merger cover?

| Option | Description | Selected |
|--------|-------------|----------|
| Events + jobs (Recommended) | Events (title+date+organizer) and jobs (company+role+location); loot out | ✓ |
| All pipelines | Shared merger with per-pipeline keys incl. loot | |
| Events only | EVT-07 literal scope; jobs cross-posts alert separately | |

**User's choice:** Events + jobs

---

## Loot sources & depth

### Q1: Which loot sources should Phase 5 actually monitor?

| Option | Description | Selected |
|--------|-------------|----------|
| Divert + vendor watchlist (Recommended) | Divert failed-₹1L perk events + curated vendor pages (CNCF/LF, AWS, Azure, GitHub Education, Oracle); swag from candidates | ✓ |
| Divert-only this phase | Only the divert path; vendor monitoring deferred | |
| Broad community too | + HN/dev.to/free-stuff feeds; noisiest | |

**User's choice:** Divert + vendor watchlist

### Q2: How deep should loot verification go?

| Option | Description | Selected |
|--------|-------------|----------|
| Prefilter + FAQ audit (Recommended) | Deterministic flags + auditor reads official rules/FAQ via 2-hop: shipping hard-reject, card flag, cited claim steps | ✓ |
| Auditor-only | Auditor full-text/FAQ read is sole authority | |
| Keyword-only | No FAQ read; US-only drops slip through (Pitfall 10) | |

**User's choice:** Prefilter + FAQ audit

### Q3: Extend the locked Opportunity schema for jobs/loot fields, or encode within existing fields?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend schema (Recommended) | Documented one-way migration: jobs (experience span, stack tags, eligibility) + loot (shipping_verified, card_required, claim_steps) | ✓ |
| Encode in existing | prize_text/audit_summary reuse; zero migration, muddy semantics | |
| Minimal extension | Only criteria-critical fields now; rest later | |

**User's choice:** Extend schema

---

## the agent's Discretion

No "you decide" selections were made — the user chose a concrete option for every question. Flexibility granted to researcher/planner on: similarity algorithm details (≥0.9 initial lock), diverted vs watchlist loot audit-path sharing and loot card format, vendor-watchlist contents/cadence (4–6h example), swag-drop detection mechanics, Sys/Cloud vs General SWE routing classifier mechanics, channel naming/ID-vs-name resolution, poll staggering within 30–60m, per-adapter parser shapes (incl. Workday headless path), scam-detector implementation (locked classes only), auto-learned board state persistence, rejection-persistence mechanics, and the shared audit orchestrator structure (must land end-to-end).

## Deferred Ideas

None — discussion stayed within phase scope. The broad-community loot feed option was considered and not selected.
