# Requirements: Zod

**Defined:** 2026-10-15
**Core Value:** Only verified, deduplicated, high-signal opportunities reach Discord — every online event has audited cash ≥₹1,00,000 or a real perk with India shipping, every job is true 0–1yr/intern, every alert links the official source.

## v1 Requirements

### Ingestion

- [ ] **ING-01**: System polls structured event portals (Unstop, Devfolio, Devpost, Luma, Meetup, CTFtime, CLIST.by) via JSON APIs/RSS first every 15–30 minutes
- [ ] **ING-02**: System crawls DK & Udupi college/community watchlist domains and bio-link pages every 2–4 hours
- [ ] **ING-03**: System polls job/fellowship portals (Greenhouse, Lever, Ashby, YC, Wellfound, Cutshort, Cuvette, LFX/GSoC/MLH) via search-index + direct polling every 30–60 minutes
- [ ] **ING-04**: Bot relays external Discord #announcements into private #raw-incoming-feeds via official Bot Gateway (no self-bot)
- [ ] **ING-05**: System polls X/LinkedIn via exported session cookies on randomized 45–90 minute jitter plus search-index fallback
- [ ] **ING-06**: Sanitizer strips scripts/styles/SVG/nav via Jina-first + shared headless browser fallback, cutting token payload ≥85%

### Swarm

- [ ] **SWM-01**: Scout rejects expired items and obvious spam from titles/snippets before any scrape
- [ ] **SWM-02**: Link-Hopper resolves aggregator/social cards to official event domain or direct ATS link within max 2 hops
- [ ] **SWM-03**: Every candidate URL gets a persistent Task_Scratchpad (STEP_1..STEP_4 + partial_stream_buffer) in local memory
- [ ] **SWM-04**: On 429/413/timeout mid-audit, orchestrator cools the model 60s and hands step_1+step_2 outputs to the next 2D-ladder bucket with zero re-scraping
- [ ] **SWM-05**: On finish_reason:length, partial output is stitched via continuation prompt into complete JSON/analysis
- [ ] **SWM-06**: Key Router rotates Tier1 per-model buckets (Groq, GitHub Models, SambaNova; Cerebras disabled by default) then Tier2 pools (Mistral, Z.ai, NIM/Cohere/OpenRouter :free)

### Events Pipeline

- [ ] **EVT-01**: Sys/CP/Sec (systems, competitive programming, CTF/InfoSec) events fast-track to #🔥-priority-sys-cp-sec after legitimacy check
- [ ] **EVT-02**: 80/20 domain filter admits all SWE domains, adjacent deep-tech only at organizer≥9 and agenda≥9, rejects non-technical business events
- [ ] **EVT-03**: Local DK/Udupi offline events route to #📍-local-dk-udupi regardless of prize size
- [ ] **EVT-04**: Out-of-town offline events require verified selection round + quality to reach #✈️-travel-curated; walk-in low-effort rejected
- [ ] **EVT-05**: Online events require verified liquid cash ≥₹1,00,000 INR (credits/vouchers/certificates stripped) to reach #💻-online-1lakh-plus
- [ ] **EVT-06**: Legit TBA prize/agenda events fire Ping #1 to #⏳-early-tba-radar with WATCHING_TBA status and re-audit every 48h until Ping #2
- [ ] **EVT-07**: Cross-platform duplicates merge on normalized title + ±3d date window + organizer into one master record with unified registration_links[]

### Jobs Pipeline

- [ ] **JOB-01**: System admits India on-site/hybrid roles plus India-eligible global remote roles
- [ ] **JOB-02**: Deep-Auditor admits internships, 6-month PPOs, new-grad, off-campus, LFX/GSoC fellowships, and 0–1yr entry roles from full requirements text
- [ ] **JOB-03**: System rejects 2+yr roles, unpaid non-fellowships, and pay-for-training/certificate scams
- [ ] **JOB-04**: Systems/Cloud/DevOps/SRE/K8s/Rust-Go-C roles route to #⚙️-jobs-sys-cloud-devops with stack + ATS link
- [ ] **JOB-05**: Other verified SWE roles route to #💼-jobs-general-swe with eligibility + direct apply link

### Loot Pipeline

- [ ] **LOT-01**: Online events failing the ₹1L cash rule are checked for free-perk diversion to #🎁-free-swag-and-credits before REJECTED
- [ ] **LOT-02**: Cloud/AI credit alerts flag credit-card requirement for verification
- [ ] **LOT-03**: Certification voucher alerts cover 100%-free exams (CNCF/LF, AWS, Azure, GitHub, Oracle) with exact claim steps
- [ ] **LOT-04**: Physical swag alerts verify global-or-India shipping from official rules/FAQ and reject US/EU-only drops

### Memory

- [ ] **MEM-01**: Hot PocketBase `opportunities` collection stores fingerprint_hash, pipeline, bucket_channel, status, prize, links, deadlines, reminders, bookmark, audit_summary
- [ ] **MEM-02**: Hot `agent_telemetry` ring streams slot/provider/model/step/url/status over SSE with 24h retention
- [ ] **MEM-03**: Cold Turso `tombstone_ledger` (url_hash PK, fingerprint, terminal status) is checked pre-scrape in <5ms and never deleted
- [ ] **MEM-04**: Cold `taste_rules` (BLOCK/BOOST/WEIGHT/CUSTOM) inject into Auditor/Curator prompts from #🧠-bot-training-chat feedback with confirmation reply
- [ ] **MEM-05**: Midnight garbage collector purges heavy text 24h after end_date (48h after rejection), retaining tombstones + taste rules

### Delivery & Dashboard

- [ ] **UI-01**: Discord router posts audit cards (title, organizer, dates, mode, prize breakdown, merged links, 1-line audit) to the 10-channel matrix with 48h/24h deadline reminders for bookmarked/priority items
- [ ] **UI-02**: 📌 reaction bookmarks an opportunity and arms its deadline reminders
- [ ] **DSH-01**: Cloudflare Zero Trust gate rejects unauthenticated requests before any UI or SSE stream renders; dashboard is read-only v1
- [ ] **DSH-02**: Top panel shows rolling agent slots (provider/model reel + micro-step ticker incl. 429 baton-pass) live from PocketBase SSE
- [ ] **DSH-03**: Middle panel shows 2D pool health grid (READY/ACTIVE/60s-COOLDOWN/DAILY-CAP per provider-model bucket)
- [ ] **DSH-04**: Bottom panel shows filterable read-only boards (Events Local/Travel/Online, TBA queue, Jobs Sys vs General, Loot, live audit & rejection log) served via cloudflared tunnel with zero open inbound ports
- [ ] **OPS-01**: Oracle VM holds 22–30% baseline RAM via 2.5GB cache buffer to avoid 7-day idle reclaim; single shared browser capped at 2–3 tabs with media loading disabled

## v2 Requirements

### Taste & Personalization

- **TSTE-01**: Dashboard search across audit summaries and rejection reasons
- **TSTE-02**: Per-user digest preferences (channel mute, prize threshold override)
- **TSTE-03**: Organizer reputation auto-scoring from historical pass/fail

### Coverage Growth

- **COV-01**: Auto-apply link prefilling (never submit without user)
- **COV-02**: Mobile companion view of dashboard boards
- **COV-03**: Sponsored-listing detector confidence scores

## Out of Scope

| Feature | Reason |
|---------|--------|
| Dashboard manual mutations | v1 read-only keeps single-writer audit trail |
| US/EU-only swag alerts | Violates India-shipping loot mission |
| 2+yr / unpaid / pay-for-training roles | Not fresher-true, scam-adjacent |
| Non-technical business events | Outside 80/20 domain |
| Walk-in out-of-town low-effort events | Travel noise without selection signal |
| Real-time chat / mobile app | Not needed for alert-routing value |
| Cerebras Tier-1 default routing | Free tier ended Jul 2026, billing trap — disabled by default |
| Discord self-bot scraping | Ban risk; Gateway relay only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ING-01 | Phase TBD | Pending |
| ING-02 | Phase TBD | Pending |
| ING-03 | Phase TBD | Pending |
| ING-04 | Phase TBD | Pending |
| ING-05 | Phase TBD | Pending |
| ING-06 | Phase TBD | Pending |
| SWM-01 | Phase TBD | Pending |
| SWM-02 | Phase TBD | Pending |
| SWM-03 | Phase TBD | Pending |
| SWM-04 | Phase TBD | Pending |
| SWM-05 | Phase TBD | Pending |
| SWM-06 | Phase TBD | Pending |
| EVT-01 | Phase TBD | Pending |
| EVT-02 | Phase TBD | Pending |
| EVT-03 | Phase TBD | Pending |
| EVT-04 | Phase TBD | Pending |
| EVT-05 | Phase TBD | Pending |
| EVT-06 | Phase TBD | Pending |
| EVT-07 | Phase TBD | Pending |
| JOB-01 | Phase TBD | Pending |
| JOB-02 | Phase TBD | Pending |
| JOB-03 | Phase TBD | Pending |
| JOB-04 | Phase TBD | Pending |
| JOB-05 | Phase TBD | Pending |
| LOT-01 | Phase TBD | Pending |
| LOT-02 | Phase TBD | Pending |
| LOT-03 | Phase TBD | Pending |
| LOT-04 | Phase TBD | Pending |
| MEM-01 | Phase TBD | Pending |
| MEM-02 | Phase TBD | Pending |
| MEM-03 | Phase TBD | Pending |
| MEM-04 | Phase TBD | Pending |
| MEM-05 | Phase TBD | Pending |
| UI-01 | Phase TBD | Pending |
| UI-02 | Phase TBD | Pending |
| DSH-01 | Phase TBD | Pending |
| DSH-02 | Phase TBD | Pending |
| DSH-03 | Phase TBD | Pending |
| DSH-04 | Phase TBD | Pending |
| OPS-01 | Phase TBD | Pending |

**Coverage:**
- v1 requirements: 40 total
- Mapped to phases: 0
- Unmapped: 40 ⚠️

---
*Requirements defined: 2026-10-15*
*Last updated: 2026-10-15 after initial definition*
