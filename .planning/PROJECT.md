# Zod (Autonomous Opportunity-Intelligence Swarm)

## What This Is

Zod is a self-hosted, 24/7 autonomous multi-agent system that discovers, audits, deduplicates, and routes high-signal technical opportunities across three parallel pipelines: tech events/hackathons, fresher/intern jobs, and zero-cost developer perks. It exposes a split-channel interface: a Discord bot for routed alerts across 10 channels plus a locked real-time web telemetry dashboard (read-only v1) behind Cloudflare Zero Trust.

## Core Value

Only verified, deduplicated, high-signal opportunities reach Discord — every online event has audited cash ≥₹1,00,000 or a real perk with India shipping, every job is true 0–1yr/intern, every alert links the official source.

## Requirements

### Validated

- ✓ Poll job/fellowship portals (Greenhouse, Lever, Ashby, Workday, YC, Wellfound, Cutshort, Cuvette, LFX, GSoC, MLH) every 30–60m — Phase 5
- ✓ Enforce job rules: India + India-eligible remote, 0–1yr/intern verification with 2yr+/scam rejection, Sys/Cloud/DevOps vs General SWE routing — Phase 5
- ✓ Enforce loot rules: trash-to-treasure divert gate, credit/voucher/swag verification with India-shipping check — Phase 5
- ✓ Fuzzy duplicate merger (≥0.9 title + ±3d + organizer/company evidence) — Phase 5 (EVT-07)

### Active

- [ ] Discover structured event portals (Unstop, Devfolio, Devpost, Luma, Meetup, CTFtime, CLIST.by) via APIs/RSS first, headless fallback, 15–30m poll
- [ ] Watch DK & Udupi local list (NITK, MIT Manipal, NMAMIT, SJEC, Sahyadri, MITE, AJIET, St. Aloysius, SOSC, GDG/FOSS) via domain crawler + bio-link watcher, 2–4h
- [ ] Relay Discord #announcements natively via Bot Gateway into #raw-incoming-feeds (no self-bot)
- [ ] Poll X/LinkedIn via session-cookie + 45–90m jitter + search-index fallback
- [ ] Run Scout → Link-Hopper (2 hops max) → Deep-Auditor → Chief Curator with atomic Task_Scratchpad and 429/413 baton-pass + length-stitch
- [ ] Enforce event rules: Sys/CP/Sec fast-track, 80/20 domain filter, 3-bucket geo/prize (Local / Travel-selected / Online ₹1L+), TBA two-ping 48h loop
- [ ] Persist hot memory (PocketBase: opportunities + agent_telemetry), cold tombstones + taste_rules (Turso), midnight GC purge with permanent fingerprints
- [ ] Route 10 Discord channels with audit cards, deadline reminders, bookmark reactions, #🧠-bot-training-chat taste learning
- [ ] Serve locked dashboard: Zero Trust gate, rolling agent slots over PocketBase SSE, 2D pool health grid, read-only opportunity/audit boards via Cloudflare Tunnel

### Out of Scope

- Manual dashboard mutations (v1 read-only) — keeps audit trail single-writer
- US/EU-only swag without India shipping — violates loot mission
- 2+yr experience roles, unpaid non-fellowships, pay-for-training scams — not fresher-true
- Non-technical business/management events — out of 80/20 domain
- Walk-in low-effort out-of-town events without selection round — travel noise
- Real-time chat / mobile app — not needed for alert-routing value

## Context

- Target runtime: Oracle Cloud Always-Free ARM Ampere (2–4 OCPUs, 12–24GB RAM, 200GB, 10TB egress), 24/7, zero monthly cost across compute/storage/LLM free tiers
- Hot DB: PocketBase single-binary SQLite WAL on VM, native SSE; Cold: Turso (5GB, 500M reads) for tombstone_ledger + taste_rules surviving VM rebuild
- Sanitizer: Crawl4AI/Jina + 1 shared headless browser (Playwright), strip scripts/styles/SVG/nav (85–90% token cut), max 2–3 tabs, images/fonts disabled
- Network: Cloudflare Pages/Vercel dashboard → cloudflared tunnel, zero open inbound ports
- LLM swarm 2D ladder: Tier1 Groq (llama-3.1-8b-instant, llama-4-scout, qwen3-32b, kimi-k2, gpt-oss-120b/20b, llama-3.3-70b) / Cerebras (llama3.1-8b, gpt-oss-120b, qwen-3-235b, glm-4.7) / GitHub Models (gpt-4.1-mini/4.1, o4-mini, llama-4-maverick) / SambaNova (llama-3.3-70B, R1, Qwen3-32B); Tier2 Mistral pool, Z.ai GLM-4.7-Flash, NVIDIA NIM/Cohere/OpenRouter :free overflow
- Language: TypeScript monorepo (discord.js + Playwright + PocketBase SDK native)
- Prior research: none yet — research-first selected, will populate `.planning/research/`

## Constraints

- **Cost**: Zero monthly infra + LLM — permanent free tiers only
- **Compute**: Oracle ARM idle reclaim — hold 22–30% RAM via 2.5GB cache buffer
- **Hop**: Link-Hopper hard max 2 hops (Feed → Aggregator → Official/ATS)
- **Browser**: 1 shared instance, max 2–3 queued tabs, media loading off
- **Polling**: Events 15–30m, DK/Udupi 2–4h, Jobs 30–60m, X/LI 45–90m jitter
- **Auth**: Cloudflare Zero Trust owner-only wall, reject before UI/SSE render
- **Compliance**: Discord Gateway only, burner-cookie X/LI with human pacing
- **Prize**: Online events need verified liquid cash ≥₹1,00,000 (credits/vouchers stripped); swag must ship India/global

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Turso over Cloudflare D1 for cold ledger | 5GB + 500M reads, survives VM rebuild, simple SQLite replica | — Pending |
| Cloudflare Zero Trust over Discord-OAuth gate | Hard login wall at edge, zero app auth code, covers SSE too | — Pending |
| TypeScript monorepo (discord.js + Playwright) | Native bot + browser + PB SDK, one toolchain on ARM | — Pending |
| PocketBase hot + Turso cold split | Zero-latency local ops + off-server permanent memory, no Supabase pauses | — Pending |
| Tunnel with zero inbound ports | Oracle firewall stays closed, encrypted Pages→VM path | — Pending |
| 2D per-model bucket rotation + scratchpad handoff | Survives 429/413/length mid-STEP_3 without re-scraping | — Pending |
| Research-first before requirements | Validate stack/features/arch/pitfalls against live docs | — Pending |
| MVP vertical slices for roadmap | Working alert slice fast, then add pipelines | — Pending |
| D-14 one-way schema migration | Nullable/defaulted fields only, no new collection; Phase 4 rows parse via defaults | Shipped Phase 5 (05-08) |
| resolveChannel env-ID-first | Bucket→env channel ID mapping before exact-name fallback; unknown keeps skip path | Shipped Phase 5 (05-08) |
| .env.example bijective with EnvSchema | 3 channel keys + 4 Pitfall-10 drift keys; bijection guard in 05-06 | Shipped Phase 5 (05-06, 05-08) |
| D-02 seed + auto-learn board rotation | extractBoardUrl (3 ATS hosts), learnBoard idempotent + capped 200, next-tick fan-out | Shipped Phase 5 (05-02) |
| Workday cxs JSON + browser fallback | cxs JSON first ([ASSUMED A1]), exactly-one fetchViaBrowser fallback | Shipped Phase 5 (05-02) |
| DEFAULT_FELLOWSHIP_ALLOWLIST | LFX/GSoC/MLH defaults + FELLOWSHIP_ALLOWLIST_EXTRA env, fail-closed | Shipped Phase 5 (05-03) |
| D-04 senior screen | Whole-word case-insensitive title regex; Leadership/Managerial don't match | Shipped Phase 5 (05-03) |
| Listing-stage scam/geo flag-only | Flag-only detectors, never auto-reject; auditor confirms from full text | Shipped Phase 5 (05-03) |
| drainLootRow named export | Reused verbatim by events divert path — zero duplicated logic | Shipped Phase 5 (05-04) |
| Event bucket verbatim reuse | Phase 4 bucket constants (#🔥-priority-sys-cp-sec, #-online-1lakh-plus) | Shipped Phase 5 (05-04) |
| YC browser-mode + Wellfound fetch-facade | Probe-first mode selection; logged-out only, no credentials | Shipped Phase 5 (05-07) |
| string-similarity-js@2.1.4 | Audited OK; deprecated string-similarity forbidden | Shipped Phase 5 (05-05) |
| MergeStore structural port | No db-hot/db-cold import in @zod/dedup; createMergeStore wires PB/cold | Shipped Phase 5 (05-05) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-16 after Phase 5*
