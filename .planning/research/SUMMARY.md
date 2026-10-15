# Project Research Summary

**Project:** Zod — autonomous opportunity-intelligence swarm (Discord bot + realtime dashboard, Oracle Always-Free ARM)
**Domain:** Multi-agent ingestion → verify → route curation system (tech events/hackathons, fresher jobs/internships, free dev perks)
**Researched:** 2026-10-15
**Confidence:** HIGH (stack/pitfalls verified against official docs via Context7; MEDIUM on exact free-tier model IDs which rotate quarterly, and on competitor feature parity — web search unavailable at research time)

## Executive Summary

Zod is a zero-cost 24/7 curation swarm: pollers ingest opportunities from portals, ATS boards, local college sites and social channels; a 4-agent pipeline (Scout → Link-Hopper → Deep-Auditor → Chief Curator) verifies each item with 2-hop official-source resolution; and a Discord router delivers audited cards into 10 segmented channels, mirrored on a read-only SSE dashboard. Experts build this shape as a **layered pipeline with a central orchestrator and durable work-state — never agents calling agents** — with ingestion, verification, and routing as separate stages joined by a scratchpad state token.

The recommended approach is a TypeScript monorepo (Node 22, pnpm workspaces) with three deployables — discord.js v14 bot, kelektiv/node-cron scheduler, PocketBase hot DB on the Oracle Ampere VM — plus Turso as the off-VM cold ledger, Cloudflare Tunnel + Zero Trust as the only ingress, one shared Playwright browser behind a semaphore, a Jina-Reader-first sanitizer, and a 2D per-(provider×model) LLM router behind a single gateway facade. Build order is load-bearing: memory + scratchpad → browser + sanitizer → LLM router skeleton → one events vertical slice → remaining pipelines → delivery polish → dashboard/hardening.

The dominant risks are all existential, not cosmetic: Oracle idle-reclaim deleting the VM, free-LLM quota walls (429/413/length-cut) stalling the swarm, a shared Chromium OOMing the box, ToS bans killing Discord or social sources, and trust-killers (duplicate pings, fake ₹-prizes, 2yr+ roles routed as "fresher", US-only swag). Every one of these has a known prevention — RAM buffer + rebuild runbook, per-bucket cooldowns + baton-pass + prompt budgets, tab semaphore + close-in-finally + recycle, Bot-Gateway-only + paced polling + cookie health probes, two-stage dedup eval + credit-stripping prize rules + scam screens — and each prevention is assigned to a specific phase as an acceptance gate (see Implications).

## Key Findings

### Recommended Stack

Single-language TS monorepo on Node 22 LTS with pnpm 10 workspaces (`apps/bot,scheduler,dashboard` + `packages/*`); discord.js v14 for the gateway bot; PocketBase v0.35.x self-hosted as the hot store (native SSE realtime) with the JS SDK + `eventsource` polyfill; Turso remote-only via `@libsql/client` as the cold tombstone/taste ledger; `cloudflared` tunnel + Pages + Zero Trust Access so the Oracle firewall stays fully closed; `playwright-core` single shared Chromium (2–3 tab semaphore, media-abort, `--only-shell`); Jina Reader default + `cheerio`/`turndown` sanitize pipeline (Crawl4AI only if Jina throttles); tiered free-LLM ladder behind one `LlmRouter` (`groq-sdk` + `openai`-compat clients); `kelektiv/node-cron` (never `node-cron`) with `noOverlap` + jitter; `zod` v4 validation at every external boundary; `pino` logging mirrored to telemetry; `vitest` from phase 1. Full rationale, versions, and install commands: see `STACK.md`.

**Core technologies:**
- Node.js 22 LTS + TypeScript ~5.9 + pnpm 10 — single toolchain for bot/scheduler/scrapers on ARM64 — strict TS + zod kills scraper-shape bugs
- discord.js ^14.25.1 — Gateway bot, 10-channel router, embeds, bookmark reactions — the stable documented v14 line
- PocketBase v0.35.x (hot) + Turso via @libsql/client ^0.15 (cold) — local SQLite-WAL + realtime SSE for live ops; SQLite-over-wire tombstones surviving VM rebuild
- Cloudflare Tunnel + Pages + Zero Trust Access — zero inbound ports; edge wall covers UI and SSE with no app-auth code
- playwright-core + Jina Reader + cheerio/turndown — RSS/API first, Jina for plain pages, one shared browser tab-queue for JS-gated pages; 85–90% token cut before any LLM call
- LLM ladder (Groq → GitHub Models → Mistral/Z.ai/NVIDIA/Cohere/OpenRouter overflow; **Cerebras disabled by default — $5 trial, not free**) — 2D per-model buckets, 429→next-bucket, 413→shrink/stitch
- kelektiv/node-cron ^4 + zod ^4 + pino ^10 — noOverlap single-flight scheduling; runtime validation everywhere; telemetry-mapped logging

> **Correction applied (STACK.md vs PITFALLS.md):** STACK lists Cerebras in Tier-1; PITFALLS proves the always-free tier ended Jul 2026 (now a $5 card-required 30-day trial). Roadmap treats Cerebras as **paid-overflow, disabled by default** with a spend circuit-breaker. Re-verify the whole provider table at the start of the LLM phase and quarterly.

### Expected Features

Trust is the product: every alert must be real, fresh, deduplicated, and actionable. Table stakes are structured ingestion, official-source links, fuzzy dedup, tombstones, deadline display, eligibility/prize/shipping gates, multi-channel routing, and a read-only board. The moat is the combination no national aggregator bothers with: the 4-agent audit pipeline, DK/Udupi hyper-local watchlist, geo/prize buckets + 80/20 + fast-track rules, TBA re-audit loop, trash-to-treasure divert, bookmark reactions, taste-rule learning, SSE transparency, Discord-relay ingestion, paced social polling, and ₹0/month operation. Full landscape, dependencies, and MVP scope: see `FEATURES.md`.

**Must have (table stakes):**
- Structured portal ingestion via API/RSS first (Unstop, Devfolio, Devpost, Luma, CTFtime/CLIST) — headless is fallback, not default
- Scout → Link-Hopper (≤2 hops) → Deep-Auditor → Chief Curator pipeline with scratchpad + 429/413 baton-pass
- Prize/eligibility/shipping audit gates (liquid-cash-only ₹1L, 0–1yr/intern true-check, India-shipping check) — the Core Value
- Fuzzy dedup merger + permanent tombstone fingerprints (hot + cold checked)
- 10-channel Discord routing cards with official-source links + deadline display
- Hot (PocketBase) + cold (Turso) memory + midnight GC
- Locked read-only dashboard (Zero Trust + opportunity board + audit/rejection log)

**Should have (competitive):**
- ATS job polling (Greenhouse/Lever/Ashby public JSON first; Workday headless later) — after events slice is clean 1–2 weeks
- DK/Udupi watchlist crawler (highest-effort ingestion; schedule after national portals work)
- Discord relay ingestion (Bot Gateway → #raw-incoming-feeds; cheap fast win once partners exist)
- Deadline reminders (T-7d/T-48h/T-24h) + TBA 48h re-audit loop with terminal states
- Bookmark reactions → per-user save without login
- SSE telemetry slots + 2D pool-health grid (instrument writes during pipeline build)
- Human-paced X/LinkedIn polling (45–90m jitter + search-index fallback; ToS-sensitive, never lead with it)

**Defer (v2+):**
- Taste-rule learning loop (#🧠-bot-training-chat → taste_rules) — needs weeks of routed/rejected data first
- Trash-to-treasure divert tuning — needs loot-volume data to set thresholds
- Per-user bookmark surfacing / digest DMs — needs identity store + opt-in
- Dashboard search/filters — P3 until volume demands it
- Anti-features (explicitly rejected): manual dashboard mutations, bespoke mobile app, US-only swag, 2yr+/unpaid/scam listings, non-tech events, self-bots, aggressive social scraping, sponsored listings, auto-apply

### Architecture Approach

Layered pipeline with a single orchestrator brain: per-pipeline schedulers enqueue raw URLs → dedup gate (fingerprint vs tombstone cache) → `Task_Scratchpad` STEP_1..4 state machine → shared browser queue → sanitizer → Link-Hopper → Deep-Auditor/Curator via the LLM facade → Discord router (sole writer) + PB upsert + batched Turso tombstones + telemetry. Agents are stateless stage functions (row in → row out); the scratchpad row is the crash-safe resume token. Hot/cold memory split (PB live + telemetry ring; Turso ledger + taste) with nightly GC reconcile. SSE dashboard is a read-only view over PB realtime behind the tunnel. Full diagrams, patterns, and build-order contract: see `ARCHITECTURE.md`.

**Major components:**
1. Orchestrator + Task_Scratchpad STEP machine — owns scheduler registry, dedup gate, STEP_1→4 advancement, 429/413 baton-pass; single-writer audit trail
2. Shared Playwright browser queue + sanitizer stage — 1 instance, FIFO p-limit(2–3), isolated contexts, media-abort, close-in-finally, periodic recycle; `url → capped markdown` contract every agent depends on
3. 2D LLM key/model router + gateway — per-(provider×model) buckets with independent cooldowns, priority lanes (Curator > Auditor > Scout), client-side prompt budgets, length-stitch resume; agents never touch keys
4. Memory layer (PB hot + Turso cold + midnight GC) — opportunities/agent_telemetry/scratchpad live; tombstone_ledger/taste_rules permanent; hash-PK point lookups, minimal fingerprints, idempotent GC with success telemetry
5. Egress layer (Discord router/formatter + SSE dashboard + cloudflared) — verdict→channel mapping, compact audit cards with evidence quotes, queued alerts surviving Discord outages; pipelines never depend on tunnel/dashboard availability

### Critical Pitfalls

Fifteen documented in `PITFALLS.md`; the five that kill the project outright, plus the two trust-killers that empty the channels:

1. **Oracle idle reclaim deletes the VM after 7 quiet days** — bursty scrapers sit under 20% CPU/net p95; hold 22–30% RAM with a wired buffer, add an external watchdog, replicate hot→cold with minutes of lag, ship a tested one-command rebuild runbook in Phase 1.
2. **Cerebras is not free anymore** — route autonomous traffic there and you either hard-fail or accrue charges; demote to disabled-by-default, re-verify the provider table at LLM-phase start and quarterly, add a spend circuit-breaker.
3. **Groq 429 vs 413 vs length-cut handled as one "retry"** — 413-retried-as-is never succeeds; daily-cap walls need midnight-aware bulkheads; parse the error body, park only that bucket, shrink-or-escalate on 413, stitch on length-cut, flag UNVERIFIED when truncated.
4. **Shared-org pool contention deadlocks pipelines** — Scout bursts starve Curator verdicts; centralize behind one gateway with priority lanes, global in-flight cap, jittered starts, fingerprint-then-lookup caching.
5. **Shared browser OOMs the VM** — unclosed contexts/tabs + heap growth + /dev/shm exhaustion; enforce tab budget in code, close-in-finally everywhere, recycle the process every 100–200 pages, per-nav timeouts, RSS telemetry with alert/recycle thresholds.
6. **Fuzzy-dedup false merges + prize/seniority false passes** — distinct roles collapsed, credit-inflated "₹5L prizes" and 2yr+ roles routed as fresher; two-stage dedup with hard-key agreement + labeled must-merge/must-not-merge eval, credit-stripping prize rules with cited quotes, structured experience-span + separate scam screen with hard REJECTs.
7. **Secrets/ToS/scheduler self-inflicted outages** — tokens in git, self-bots, hammered dead sessions, overlapping cron stampedes, unsupervised tunnels; env-only secrets + redacting logger + pre-commit scan from day one, Gateway-only Discord, cookie health probes + search-index fallback, single-flight scheduling, supervised cloudflared with dual-heartbeat monitoring.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation — VM, memory, tunnel, scheduler skeleton
**Rationale:** Every later layer writes to memory, polls through the scheduler, and hides behind the tunnel; reclaim defense and secret hygiene cannot be retrofitted (tokens in history, unreplicated hot DB).
**Delivers:** Oracle Ampere provisioned + closed firewall, PocketBase (ARM64, localhost-only) + Turso remote schemas (opportunities, agent_telemetry, task_scratchpad, tombstone_ledger, taste_rules, fingerprint fn), cloudflared supervised + Zero Trust owner-only, kelektiv/node-cron framework with single-flight + jitter + duration metrics, env-only secrets + redacting logger + pre-commit scan, external watchdog + dual-heartbeat monitoring, tested rebuild runbook.
**Addresses:** Hot+cold memory, scheduler cadences, locked dashboard shell, tombstone/GC schema + indexes.
**Avoids:** Oracle reclaim, secret leakage, cron stampedes, tunnel-supervision gaps, Turso scan/index debt.

### Phase 2: Scraper foundation — browser queue + sanitizer + dedup primitives
**Rationale:** The `url → capped markdown` contract is the prerequisite of every agent and the 85–90% token cut is what makes free-LLM auditing affordable at all.
**Delivers:** Singleton browser package (semaphore 2–3, media-abort, close-in-finally, recycle, RSS gauge), sanitizer (Jina-first, Playwright+readability fallback, cheerio strip → turndown → length-cap with token-estimate-before-send), fingerprint + two-stage dedup primitives with merge-provenance store.
**Uses:** playwright-core --only-shell, cheerio, turndown, rss-parser, fast-levenshtein, date-fns.
**Implements:** Shared-browser semaphore queue, sanitizer stage, hot/cold fingerprint path.
**Avoids:** Browser OOM, raw-HTML-to-LLM 413 bankruptcy, headless-first bans (API/RSS-first enforced per source).

### Phase 3: LLM swarm — gateway router + 2D buckets + chaos tests
**Rationale:** The hardest reliability component; auditors cannot run without it, and contention only appears under multi-pipeline load — so harden the gateway before any real pipeline leans on it.
**Delivers:** `complete()` facade, per-(provider×model) buckets with cooldowns, priority lanes, daily-cap bulkheads, 429/413/length routing, partial_stream_buffer stitch, provider-capability config table (Cerebras OFF), spend circuit-breaker, per-bucket telemetry feeding the future health grid; chaos suite forcing 429/413/length per model.
**Uses:** groq-sdk, openai-compat clients, pino telemetry.
**Implements:** 2D per-bucket cooldown router, baton-pass resume.
**Avoids:** 429/413 design errors, shared-pool deadlock, Cerebras billing, silent truncated verdicts.
**Research flag:** YES — re-verify every provider's free status, model IDs, and TPM/TPD/RPM numbers at phase start (they rotate quarterly).

### Phase 4: Events vertical slice — first end-to-end verified alert
**Rationale:** Proves the whole data flow (ingest → verify → route) on one pipeline before multiplying load; national portals are the cheapest volume.
**Delivers:** Events scheduler (15–30m) → Scout → Auditor → Curator → 1–2 Discord channels, 2-hop resolve, event rule pack + ₹1L liquid-cash gate with cited quotes, geo/prize buckets, deadline_utc persisted + displayed, audit-card formatter, PB upsert + tombstone batching.
**Addresses:** Structured portal ingestion, 4-agent pipeline core, prize audit, 10-channel routing (first channels), deadline display.
**Avoids:** Prize-credit false passes, merge-before-verify, dashboard-writes-to-store.
**Research flag:** LIGHT — verify each portal's current API/RSS endpoint and field shapes during planning (Devpost API, Meetup GraphQL, CTFtime/CLIST, Luma feeds).

### Phase 5: Jobs + loot pipelines + dedup/scam hardening
**Rationale:** Parallelizable once the slice works; jobs and loot each carry their own trust-critical classifier that must ship with the first slice, not later.
**Delivers:** ATS polling (Greenhouse/Lever/Ashby JSON first; Workday headless gated), experience-span extractor + 0–1yr/intern code-gate + scam screen (hard REJECTs, logged-not-alerted), loot checklist (India-shipping, claim mechanism, expiry, card-required) + divert gate thresholds, fuzzy-merger labeled eval gate (flag-don't-merge default), TBA terminal states + inventory cap + date-pass sweep.
**Addresses:** ATS polling, eligibility verification, loot verification, TBA loop, divert gate.
**Avoids:** Seniority false PASS/REJECT, US-only swag in main channel, false merges, TBA rot, Workday-by-scrape when JSON exists.
**Research flag:** YES — ATS JSON endpoint shapes per board; loot claim-form/FAQ hop patterns.

### Phase 6: Delivery + local/social coverage — full routing and speed layers
**Rationale:** Coverage/speed layers stack after the national core is trusted; routing polish needs live Curator verdicts to tune against.
**Delivers:** All 10 channels + router mapping, deadline reminders (T-7d/T-48h/T-24h) + TBA re-pings, bookmark reactions store, Discord Gateway relay ingestion, DK/Udupi domain crawler + bio-link watcher (2–4h), X/LinkedIn paced polling (burners per source, health probes, park + search-index fallback), per-source silence alerting.
**Addresses:** Multi-channel routing, reminders, bookmarks, relay ingestion, local watchlist, social polling.
**Avoids:** ToS bans (Gateway-only, no fake accounts, no evasion tooling), correlated burner bans, alert fatigue, silent source death.
**Research flag:** YES — X/LinkedIn session + fallback posture review as a gate before build; DK/Udupi domain inventory.

### Phase 7: Telemetry dashboard + ops hardening
**Rationale:** Dashboard needs live PB data to be meaningful, so it comes last; GC/tunnel/SSE failure modes are verified against the running system, including kill-tests.
**Delivers:** Read-only SSE dashboard (slots, 2D health grid, opportunity + audit/rejection boards, source-health "last good poll"), shared event bus + viewer caps + backoff reconnect, Zero Trust edge verification (unauth denied incl. SSE), idempotent midnight GC with success telemetry + 25h-missing alert, Turso burn-rate gauge, kill-cloudflared drill (pipelines continue, alerts queue), rebuild-from-Turso drill, secret-history scan.
**Addresses:** SSE telemetry, health grid, audit log board, GC, tunnel ops.
**Avoids:** SSE fan-out storms, tunnel-death-equals-pipeline-death, GC silent failure, Turso BLOCKED surprise, Zero Trust bypass gaps.

### Phase Ordering Rationale

- **Contracts before consumers:** memory/scratchpad schemas → fetch contract → LLM facade → one slice → N pipelines → views/polish. Each layer's contract is the next layer's prerequisite; skipping ahead produces pipelines with nowhere to write and auditors with no model to call.
- **Scarcest resources first:** the two shared bottlenecks (browser tabs, LLM buckets) are isolated as packages with enforced budgets before any pipeline can stampede them — contention is designed out, not debugged out at 2× load.
- **Trust gates ride with their pipeline:** scam screen ships with jobs, shipping checklist with loot, prize-quote rule with events, dedup eval before auto-merge — never as follow-up hardening, because one false-PASS week empties a channel permanently.
- **Irreversible decisions are sequenced defensively:** secrets before first credential, single-flight before first poll, Cerebras-off before first LLM call, flag-don't-merge before auto-merge, read-only dashboard before any mutation temptation.
- **Local/social last among ingestion:** national portals alone make a viable slice; DK/Udupi (highest build cost) and X/LI (highest ToS risk) stack onto a trusted core rather than delaying first alert.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-plan-phase --research-phase`):
- **Phase 3 (LLM swarm):** free-provider lineup, exact model IDs, TPM/TPD/RPM/RPD numbers, 429-body strings — all rotate; verify against live provider docs at plan time.
- **Phase 4 (Events slice):** per-portal current API/RSS endpoints, auth needs, rate budgets, field shapes (Greenhouse/Lever/Ashby JSON, Devpost, Meetup GraphQL, CTFtime/CLIST, Luma feeds).
- **Phase 5 (Jobs/loot rules):** ATS board variants + Workday JS-wall handling; loot claim-form/FAQ location patterns per source.
- **Phase 6 (Social/local):** X/LinkedIn session-cookie viability + search-index fallback options; DK/Udupi college domain + social inventory; Discord Gateway intent/partials scoping for relay + reactions.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** PocketBase/Turso/cloudflared/node-cron wiring is well-documented in STACK sources; follow the install matrix.
- **Phase 2 (Browser/sanitizer):** shared-instance + route-abort + close-discipline are verified Context7 patterns; apply directly.
- **Phase 7 (Dashboard/SSE):** PB `subscribe()` + single-bus fan-out + Zero Trust edge wall are standard; verify with kill/unauth drills, not docs.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Context7-verified SDK docs (discord.js v14, PB js-sdk + EventSource polyfill, @libsql/client remote, Playwright route-abort, groq RateLimitError, kelektiv/noOverlap, zod v4, pino v10); one correction applied (Cerebras de-listed) |
| Features | MEDIUM | Grounded in PROJECT.md (primary spec, HIGH) + established aggregator-domain patterns; live competitor verification deferred — web search unavailable at research time |
| Architecture | MEDIUM | SDK touchpoints verified; orchestrator/scratchpad/2D-router mechanics are project-derived design validated by reasoning — phase research should confirm p-limit-vs-BullMQ and Crawl4AI-vs-readability token-cut claims |
| Pitfalls | HIGH | Infra limits, LLM quotas, ToS positions checked against official docs (Oracle reclaim rule, Groq rate limits, Cerebras pricing, Discord self-bot ban, hiQ/LinkedIn record, Turso quotas); ops failure modes MEDIUM (community experience, workload-dependent numbers) |

**Overall confidence:** MEDIUM-HIGH — buildable as specified; remaining uncertainty is concentrated in rotating free-tier specifics, not in the architecture.

### Gaps to Address

- **Free-tier snapshot freshness:** Groq/Cerebras/GitHub-Models/SambaNova/Mistral/Z.ai/NVIDIA/Cohere/OpenRouter limits and model IDs drift quarterly — re-verify at Phase 3 planning and calendar a quarterly re-check; keep the provider table in config, not code.
- **Competitor parity spot-check:** Unstop/Devfolio/Devpost/Cutshort/Cuvette/manual-curator feature table is domain-knowledge MEDIUM — spot-check live during roadmap/Phase 4 planning.
- **Cloudflare Tunnel flags:** single-source (LOW) — re-verify `cloudflared` config flags and Access-policy SSE coverage during Phase 1.
- **Crawl4AI vs readability token-cut:** claimed 85–90% cut is project-derived — measure actual cut % per source in Phase 2 and gate the LLM phase on it.
- **Jina free-tier limits:** MEDIUM and shifting — implement the Crawl4AI swap path behind the unchanged sanitize contract so throttling is a fetcher flip.
- **p-limit vs BullMQ:** in-process semaphore assumed sufficient for 0–3 pipelines — revisit only if soak tests show head-of-line blocking the priority lanes can't fix.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/discord_js_packages_discord_js_14_25_1` (12k snippets) — v14 intents/embeds/partials — STACK, ARCHITECTURE
- Context7 `/pocketbase/js-sdk` + `/pocketbase/pocketbase` + `/websites/pocketbase_io` — SDK install, EventSource polyfill, realtime subscribe — STACK, ARCHITECTURE
- Context7 `/tursodatabase/turso-docs` (4.3k snippets) — @libsql/client remote patterns — STACK
- Context7 `/microsoft/playwright` (8.9k snippets, to v1.63.0) — shared instance, context.route abort — STACK, ARCHITECTURE
- Context7 `/groq/groq-typescript` — RateLimitError + Retry-After + backoff — STACK, PITFALLS
- Context7 `/kelektiv/node-cron` + `/node-cron/node-cron` (benchmark ~90) — noOverlap, jitter/maxRandomDelay — STACK
- Context7 `/colinhacks/zod` (to v4.6.5), `/pinojs/pino` (v8/v10) — version currency — STACK
- Oracle Always Free docs — 7-day idle reclaim rule (CPU p95 + net + mem-mean <20%, thresholds revised 10%→15%→20%) — PITFALLS
- Groq rate-limits docs (console.groq.com/docs/rate-limits) — per-model RPM/RPD/TPM/TPD, 429 vs 413, org-level pooling — PITFALLS
- Cerebras pricing + free-tier trackers — always-free ended Jul 2026; $5 30-day trial, card required — PITFALLS
- Discord support article "Automated User Accounts (Self-Bots)" — termination risk — PITFALLS
- hiQ v. LinkedIn record (9th Cir. CFAA; 2022 breach ruling; $500K stipulation + injunction + deletion) — PITFALLS
- Turso pricing/usage docs — 5GB / 500M reads / 10M writes free; BLOCKED without overages; VACUUM disabled — PITFALLS
- PROJECT.md requirements + constraints — authoritative spec for cadences, budgets, scope — STACK, FEATURES

### Secondary (MEDIUM confidence)
- Playwright production-memory experience (400MB–1.5GB/Chromium, context accumulation, /dev/shm, close-in-finally) — maintainer statements + post-mortems — PITFALLS
- Greenhouse/Lever/Ashby public Boards JSON, Devpost API, Meetup GraphQL, CTFtime/CLIST APIs, discord.js Gateway + collectors, PB SSE — established integrations; version verification deferred to phase research — FEATURES
- Competitor positioning (Unstop/Devfolio/Devpost/Cutshort/Cuvette/Telegram curators) — general domain knowledge; needs live spot-check — FEATURES
- Cerebras Node SDK shape (OpenAI-compatible; docs not deep-fetched — risk low, and provider demoted regardless) — STACK
- Supabase pause behavior (rationale for PB-hot decision) — community knowledge — PITFALLS

### Tertiary (LOW confidence)
- Cloudflare Tunnel outbound-only + Zero Trust model — single source via WebFetch; re-verify flags in Phase 1 — ARCHITECTURE

---
*Research completed: 2026-10-15*
*Ready for roadmap: yes*
