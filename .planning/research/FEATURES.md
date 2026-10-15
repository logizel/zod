# Feature Research

**Domain:** Autonomous opportunity-intelligence / curation swarm (tech events + hackathons, fresher jobs/internships, free dev perks — Discord-routed + read-only telemetry dashboard)
**Researched:** 2026-10-15
**Confidence:** MEDIUM (grounded in PROJECT.md requirements + established aggregator-domain patterns; live competitor verification deferred to phase research — web search backend unavailable at research time)

## Feature Landscape

### Table Stakes (Users Expect These)

Alert-routing curation products live or die on trust: every alert must be real, fresh, deduplicated, and actionable. Missing any of these = users mute the channels or leave.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Structured portal ingestion (Unstop, Devfolio, Devpost, Luma, Meetup, CTFtime, CLIST) via API/RSS first | Every serious aggregator (Unstop itself, Devpost, CTFtime) starts from structured feeds; HTML scraping is the fallback, not the plan | MEDIUM | Prefer official APIs/RSS (Devpost API, Meetup GraphQL, CTFtime API, CLIST API/RSS, Luma discover RSS/ICS); headless fallback only where no feed exists. 15–30m poll cadence matches hackathon-listing freshness norms |
| Official-source link on every alert | Users will not click third-party summaries for applications; aggregators that omit source links read as spam/scam | LOW | Enforce at audit time: no official URL = no route. This is also the scam filter's cheapest signal |
| Deduplication across sources (fuzzy merger) | Same hackathon appears on Unstop + Devfolio + Luma + X; users punish duplicate pings fastest of all sins | MEDIUM | Normalized title + date + organizer similarity; keep canonical record, merge source URLs. Permanent fingerprints so GC'd items never re-alert |
| Deadline display + deadline reminders | "When does it close?" is the #1 follow-up question on any opportunity post; reminders drive the actual conversion | LOW | Store deadline_utc at audit; T-7d / T-48h / T-24h reminder tiers. TBA items enter the 48h re-audit loop instead of reminding on nothing |
| ATS job polling (Greenhouse / Lever / Ashby / Workday + YC, Wellfound, Cutshort, Cuvette) | Fresher-job aggregators (e.g. Cutshort, Cuvette, YC jobs board) are ATS-backed; polling public Boards APIs is the standard, stable ingestion path | MEDIUM | Greenhouse/Lever/Ashby expose public JSON Boards APIs — no auth, no scraping needed. Workday is the hard one (JS-heavy, needs headless). 30–60m cadence |
| Experience/eligibility verification on jobs (0–1yr / intern true-check) | A "fresher jobs" channel containing 2yr+ or pay-for-training listings destroys the Core Value instantly | MEDIUM | Keyword + description audit: reject 2yr+, unpaid non-fellowships, training-fee scams. This IS the product for the jobs pipeline |
| Prize / perk verification (liquid cash ≥₹1L online; India-shipping swag check) | Fake "₹10L prize pool" (credits, coupons, "worth") and US-only swag are the two classic trust-killers in this niche | MEDIUM | Strip credits/vouchers/coupons from cash math; verify liquid cash only. Loot gate: ships-to-India or global check before routing |
| Multi-channel routed delivery (per-pipeline Discord channels) | One firehose channel = mute. Users expect segmented feeds (events / jobs / loot at minimum) | LOW | 10-channel routing (Sys/CP/Sec fast-track, Sys/Cloud/DevOps vs General SWE, geo buckets) is the project's segmentation scheme; discord.js channel routing is commodity |
| Read-only opportunity board on dashboard | Users expect to browse/search what was routed without scrolling Discord history | LOW–MEDIUM | PocketBase collections + SSE give this nearly free. v1 read-only keeps single-writer audit trail — correct call |
| Tombstone / seen-memory (no re-alerts after expiry) | Re-alerting dead opportunities is the #2 churn driver after duplicates | LOW | Cold ledger (Turso) with permanent fingerprints; midnight GC purges hot DB but fingerprints survive rebuilds |

### Differentiators (Competitive Advantage)

Nobody in the Indian student-dev niche combines all of these. Each one alone exists somewhere; the combination is the moat.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| DK/Udupi college watchlist (NITK, MIT Manipal, NMAMIT, SJEC, Sahyadri, MITE, AJIET, St. Aloysius, SOSC, GDG/FOSS via domain crawler + bio-link watcher) | Hyper-local coverage no national aggregator bothers with; highest relevance-per-alert for the target user base | HIGH | Custom per-domain crawler + social bio-link watching, 2–4h cadence. No competitor does Mangalore-cluster curation. Highest build cost among ingestion sources — schedule after national portals work |
| 4-agent pipeline (Scout → Link-Hopper → Deep-Auditor → Chief Curator) with 2-hop resolve | Turns noisy raw feeds into audited, verified alerts — quality bar that manual curators (e.g. Telegram channels) can't sustain 24/7 | HIGH | The core IP. 2-hop cap (Feed → Aggregator → Official/ATS) bounds cost/latency. Atomic scratchpad + 429/413 baton-pass makes it resumable across LLM rate limits |
| 3-bucket geo/prize model (Local / Travel-selected / Online ₹1L+) + 80/20 domain filter + Sys/CP/Sec fast-track | Encodes editorial judgment as rules: kills travel-noise and off-domain spam that plague generic aggregators | MEDIUM | Pure rule layer on top of audit output; cheap to implement, high perceived curation quality |
| TBA 48h two-ping re-audit loop | Competitors either drop TBA items or spam them; re-checking twice then expiring is a visibly thoughtful touch | LOW | Scheduler + state machine on opportunities with deadline=TBA; max 2 re-pings, then tombstone |
| Trash-to-treasure divert gate (loot pipeline) | Converts low-value "free credits" spam into a separate diverted stream instead of binary accept/reject — more coverage, zero main-feed noise | LOW–MEDIUM | A routing rule with its own channel; cheap, distinctive |
| Bookmark reactions on Discord cards | Zero-friction save (emoji react) beats any "click through to dashboard and log in" flow for students living in Discord | LOW–MEDIUM | discord.js reaction collectors → per-user bookmark store; surfacing "my bookmarks" is dashboard v2 scope |
| Taste-rule learning via #🧠-bot-training-chat | Crowd-tuned relevance without building a full recommender: explicit feedback channel trains routing rules | MEDIUM | Feedback → taste_rules in Turso → Curator prompt/rule weights. Cold-start manual, compounding value over months |
| SSE telemetry slots + 2D pool health grid + audit/rejection log on dashboard | Radical transparency: users (and the owner) see WHY something was rejected and agent health live — no aggregator shows its work like this | MEDIUM | PocketBase native SSE makes slots cheap; health grid is a small aggregation view; rejection log is just exposing auditor output. High trust-per-effort |
| Discord relay ingestion (Bot Gateway → #raw-incoming-feeds, no self-bot) | Legally-safe ingestion from partner announcement channels — competitors either ignore Discord as a source or risk ToS with self-bots | LOW | discord.js Gateway is first-class; the differentiator is policy (native bot only), not tech |
| Human-paced X/LinkedIn polling (session-cookie + 45–90m jitter + search-index fallback) | Captures the "announced on X first" opportunities that portal-only aggregators miss by hours/days | MEDIUM–HIGH | ToS-sensitive; burner sessions, jitter, read-only. Fallback to search-index (Nitter-alternatives, Google/Bing site: queries) when sessions die |
| Zero-cost 24/7 autonomy (Oracle free tier + free LLM ladder with 2D rotation) | Structural advantage: incumbents pay for infra/LLM; this runs at ₹0/month, so it never needs monetization that corrupts curation (sponsored listings) | MEDIUM | 2D per-model bucket rotation + scratchpad handoff survives 429/413. Ops complexity, not user-facing — but it protects the trust model |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Manual dashboard mutations (edit/approve/reject from UI) | "Let me fix bad alerts quickly" | Breaks single-writer audit trail; multi-writer conflicts with the agent pipeline; auth surface expands | v1 read-only (already out of scope); corrections go through #🧠-bot-training-chat taste feedback |
| Real-time chat / mobile app | "Reach users where they are" | Discord already IS the mobile push surface; a bespoke app duplicates notifications with 10x maintenance | Discord native mobile push + bookmark reactions; dashboard stays desktop-telemetry |
| US/EU-only swag aggregation | "More loot volume" | Violates loot mission (India shipping); fills feed with unclaimable items → trust collapse | Trash-to-treasure divert gate; hard India-shipping check |
| 2+yr roles / unpaid non-fellowships / pay-for-training listings | "More job volume" | Destroys fresher-channel trust; scam-adjacent content creates liability | Hard rejection rules + public rejection log (transparency converts strictness into trust) |
| Non-technical / business-management events | "Bigger audience" | Dilutes 80/20 domain focus; Sys/CP/Sec audience mutes | Domain filter at Curator; out-of-scope by PROJECT.md |
| Walk-in low-effort out-of-town events (no selection round) | "More local events" | Travel noise: cost to attend exceeds expected value for students | Travel-selected bucket requires selection round / significant prize |
| Self-bot / unofficial API scraping of Discord | "Easier ingestion" | Direct Discord ToS violation → account/bot ban risk kills the whole delivery channel | Bot Gateway relay only (already mandated) |
| Aggressive X/LinkedIn scraping (no pacing) | "Fresher data" | Rate-limit bans + account burns + ToS escalation; session death cascades to blind spot with no fallback warm | Human-paced jitter + search-index fallback (already mandated) |
| Sponsored / promoted listings | "Monetization" | Corrupts the verified-signal Core Value; once users suspect pay-to-route, curation trust is unrecoverable | Zero-cost infra means no revenue pressure — keep it that way |
| Fully automatic apply / auto-registration | "One-click apply" | Credential storage liability, breaks site ToS, misfires on audited-but-complex applications | Deep-link to official source; deadline reminders drive manual conversion |

## Feature Dependencies

```
Structured portal ingestion (APIs/RSS)
    └──requires──> Sanitizer (Crawl4AI/Jina + shared headless browser)
    └──requires──> Hot memory (PocketBase opportunities collection)
                        └──requires──> Cold ledger (Turso tombstones + fingerprints)

Scout → Hopper → Auditor → Curator pipeline
    └──requires──> Structured portal ingestion (raw feed input)
    └──requires──> Sanitizer (token-cut content for LLM audit)
    └──requires──> Scratchpad + 429/413 baton-pass (resumability)
                        └──requires──> 2D LLM bucket rotation

Fuzzy dedup merger
    └──requires──> Hot memory (compare against live opportunities)
    └──requires──> Cold ledger (compare against tombstone fingerprints)

Prize/eligibility/shipping audit
    └──requires──> 2-hop resolve (official page content)
    └──requires──> Curator routing rules (bucket assignment)

TBA 48h re-audit loop
    └──requires──> Scheduler + opportunity state machine
    └──requires──> Prize/eligibility audit (re-run target)

10-channel routing cards ──requires──> Curator verdict + dedup pass
Deadline reminders ──requires──> deadline_utc persisted at audit
Bookmark reactions ──requires──> Routed cards (message IDs)
Taste-rule learning ──requires──> Rejection/audit log (training signal) + routed cards (feedback anchor)
SSE telemetry slots ──requires──> agent_telemetry in PocketBase
Pool health grid ──requires──> SSE telemetry slots (data source)
Audit/rejection log board ──requires──> Auditor output persisted

DK/Udupi watchlist ──enhances──> Structured portal ingestion (local coverage layer)
X/LinkedIn polling ──enhances──> Structured portal ingestion (speed layer)
Discord relay ingestion ──enhances──> Structured portal ingestion (community layer)
Trash-to-treasure divert ──enhances──> 10-channel routing (pressure valve)

Manual dashboard mutations ──conflicts──> Single-writer audit trail
Self-bot ingestion ──conflicts──> Bot account standing (ban risk)
Aggressive social scraping ──conflicts──> Session longevity + fallback readiness
```

### Dependency Notes

- **Pipeline requires ingestion + sanitizer + memory:** the agent swarm is pure overhead without feeds in, token-cut content, and hot/cold state. Ingestion + PocketBase + sanitizer is the true vertical-slice foundation.
- **Dedup requires both hot and cold memory:** checking only live opportunities lets GC'd items re-alert; fingerprints in Turso close the loop.
- **All routing/delivery features require Curator verdicts:** channels, reminders, bookmarks, taste learning are downstream consumers — none can precede a working pipeline.
- **Telemetry requires agent_telemetry writes:** dashboard slots/grid are views; the writes must be instrumented in the pipeline first (cheap if done during pipeline build, retrofit pain if after).
- **Local/social ingestion enhances but doesn't block:** national portals alone make a viable v1 slice; DK/Udupi + X/LI are coverage/speed layers that stack afterward.

## MVP Definition

### Launch With (v1)

Minimum slice that proves "verified alerts reach Discord 24/7":

- [ ] Structured portal ingestion (Unstop, Devfolio, Devpost, Luma, CTFtime/CLIST via API/RSS) — primary feed volume
- [ ] Scout → Hopper (2-hop) → Auditor → Curator pipeline with scratchpad + baton-pass — the quality engine
- [ ] Prize/eligibility/shipping audit rules (₹1L online-cash gate, 0–1yr/intern gate, India-shipping gate) — Core Value enforcement
- [ ] Fuzzy dedup merger + tombstone fingerprints — trust baseline
- [ ] 10-channel Discord routing cards with official-source links — delivery of value
- [ ] Hot (PocketBase) + cold (Turso) memory + midnight GC — persistence baseline
- [ ] Deadline display on cards — table-stakes completeness
- [ ] Locked read-only dashboard (Zero Trust + opportunity board + audit log) — transparency + monitoring

### Add After Validation (v1.x)

- [ ] ATS job polling (Greenhouse/Lever/Ashby first — public APIs are easy; Workday headless later) — trigger: events pipeline routing cleanly for 1–2 weeks
- [ ] DK/Udupi watchlist crawler — trigger: national event coverage stable; highest-effort ingestion, do it once the core loop is trusted
- [ ] Discord relay ingestion — trigger: partner channels identified; low cost, fast win
- [ ] Deadline reminders (T-7d/T-48h/T-24h) + TBA 48h re-audit loop — trigger: deadline_utc data quality confirmed on routed cards
- [ ] Bookmark reactions — trigger: users asking "how do I save this?"
- [ ] SSE telemetry slots + pool health grid — trigger: first LLM rate-limit incident (need visibility) or anytime; instrument writes during pipeline build
- [ ] X/LinkedIn human-paced polling — trigger: portal coverage stable AND social-session ops playbook ready; ToS-sensitive, don't lead with it

### Future Consideration (v2+)

- [ ] Taste-rule learning loop (#🧠-bot-training-chat → taste_rules weighting) — why defer: needs weeks of routed + rejected data before signal emerges
- [ ] Trash-to-treasure divert channel tuning — why defer: needs loot-pipeline volume data to tune the gate
- [ ] Per-user bookmark surfacing / digest DMs — why defer: requires user identity store + DM opt-in; reaction-save suffices for v1
- [ ] Search + filters on dashboard board — why defer: read-only browse validates first; search is P3 until volume demands it

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Structured portal ingestion (API/RSS) | HIGH | MEDIUM | P1 |
| 4-agent audit pipeline + 2-hop resolve | HIGH | HIGH | P1 |
| Prize/eligibility/shipping audit gates | HIGH | MEDIUM | P1 |
| Fuzzy dedup + tombstone fingerprints | HIGH | MEDIUM | P1 |
| 10-channel Discord routing cards | HIGH | LOW | P1 |
| Hot + cold memory + GC | HIGH | MEDIUM | P1 |
| ATS job polling (easy boards first) | HIGH | MEDIUM | P1 (jobs slice) / P2 if events-first sequencing |
| Deadline display + reminders | HIGH | LOW | P1 display / P2 reminders |
| Read-only dashboard + audit log | MEDIUM | MEDIUM | P1 (transparency is trust) |
| SSE telemetry + health grid | MEDIUM | LOW–MEDIUM | P2 |
| Discord relay ingestion | MEDIUM | LOW | P2 |
| DK/Udupi watchlist | HIGH (local) | HIGH | P2 |
| X/LinkedIn paced polling | MEDIUM–HIGH | MEDIUM–HIGH | P2 |
| TBA 48h re-audit loop | MEDIUM | LOW | P2 |
| Bookmark reactions | MEDIUM | LOW–MEDIUM | P2 |
| Taste-rule learning | MEDIUM (compounding) | MEDIUM | P3 |
| Trash-to-treasure divert tuning | LOW–MEDIUM | LOW | P3 |
| Dashboard search/filters | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | National aggregators (Unstop / Devfolio / Devpost) | Fresher-job boards (Cutshort / Cuvette / YC Jobs) | Manual curators (Telegram/Discord channels) | Our Approach |
|---------|---------------------------------------------------|--------------------------------------------------|---------------------------------------------|--------------|
| Portal aggregation | Native (own listings + some cross-posts) | ATS-backed listings | Copy-paste, irregular | Multi-portal API/RSS + 2-hop official verification — broader AND verified |
| Fresher-eligibility truth | Weak (self-reported by posters) | Medium (filters exist, spam leaks through) | None (forwarded as-is) | Auditor-enforced 0–1yr/intern gate + public rejection log |
| Prize/perk verification | Self-reported, credit-inflated pools common | N/A | Never verified | Liquid-cash-only math + India-shipping check |
| Hyper-local (DK/Udupi) | No | No | Occasionally | Dedicated crawler + bio-link watcher |
| Dedup | N/A (single platform) | N/A (single platform) | None — same poster 3x daily | Cross-source fuzzy merger + permanent fingerprints |
| Deadline reminders | Generic notifications | Email alerts | None | Tiered T-7d/T-48h/T-24h + TBA re-audit loop |
| Transparency (why rejected) | No | No | No | Public audit/rejection log + telemetry |
| Cost to operate | VC-funded | VC-funded | Human-hours | ₹0/month autonomous swarm |

## Sources

- PROJECT.md requirements + constraints (Active requirements, Out of Scope, hop/browser/polling/prize constraints) — HIGH confidence, primary spec
- Established domain patterns: Greenhouse/Lever/Ashby public Boards APIs, Devpost API, Meetup GraphQL, CTFtime/CLIST APIs, discord.js Gateway + reaction collectors, PocketBase SSE — MEDIUM confidence (well-known integrations; version-level verification deferred to phase research)
- Competitor positioning (Unstop/Devfolio/Devpost/Cutshort/Cuvette/manual Telegram curators) — MEDIUM confidence from general domain knowledge; live feature verification flagged for roadmap phase research
- Web search unavailable at research time — competitor table should be spot-checked during roadmap/phase planning

---
*Feature research for: autonomous opportunity-intelligence swarm (events / fresher-jobs / dev-perks, Discord + read-only dashboard)*
*Researched: 2026-10-15*
