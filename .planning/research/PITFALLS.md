# Pitfalls Research: Zod (Autonomous Opportunity-Intelligence Swarm)

**Domain:** Zero-cost 24/7 scraper/curator + multi-provider free-LLM swarm
**Researched:** 2026-10-15
**Confidence:** HIGH (infra limits, LLM quotas, ToS positions verified against official docs); MEDIUM (operational failure modes from community experience)

## Critical Pitfalls

### Pitfall 1: Oracle Idle Reclaim — VM silently deleted after 7 quiet days

**What goes wrong:**
Oracle reclaims Always Free compute instances deemed idle over a trailing 7-day window. Reclaimed resources are permanently deleted — VM, local PocketBase hot DB, and everything not replicated off-server is gone. The project rebuilds from Turso cold storage, but any unreplicated hot state (recent opportunities, telemetry, taste-rule updates not yet synced) is lost, and the system is dark until someone notices and re-provisions.

**Why it happens:**
The reclaim rule is an AND across three metrics: CPU p95 < 20% AND network utilization < 20% AND memory utilization (mean) < 20% (memory applies to A1/Ampere shapes only). A well-behaved scraper is bursty — it sleeps between 15–90 min polls — so CPU and network p95 can sit under 20% for days. Developers assume "my cron is running, so I'm active." Oracle measures resource pressure, not process liveness.

**How to avoid:**
- Hold memory above the line deliberately: the PROJECT.md 2.5GB cache buffer targeting 22–30% RAM is the right instinct — memory is the easiest of the three metrics to control deterministically. Size the buffer so mean memory stays ≥ 22% with margin (threshold has moved 10% → 15% → 20% across past policy revisions; assume it can move again).
- Do NOT try to game CPU with busy-loops — wasteful and fragile. Instead, ensure genuine periodic work (scrapes, GC, syncs) plus the memory buffer keeps at least one metric clearly above threshold.
- Add an external watchdog: a free uptime monitor (e.g., UptimeRobot cron pinging a health endpoint through the Cloudflare Tunnel) that pages the owner on silence. Reclaim emails go to the account inbox — set up forwarding/alerting so they are seen within hours, not weeks.
- Replicate hot → cold continuously: every PocketBase write that matters must have a Turso mirror path with bounded lag (minutes, not daily), so a rebuild loses at most one sync window.
- Keep a one-command VM rebuild runbook (provision script + Turso restore + PocketBase re-seed) tested at least once before going 24/7.

**Warning signs:**
- OCI monitoring shows 7-day CPU p95 drifting toward 20% from above; reclaim warning email from Oracle (acts as ~days-ahead notice — treat as P0).
- Health-check gaps in external monitor; Discord alert silence longer than the longest poll interval.

**Phase to address:**
Phase 1 (Foundation: VM + PocketBase + Turso + tunnel). Reclaim defense and the rebuild runbook are acceptance criteria of the foundation phase, not later hardening.

---

### Pitfall 2: Cerebras Is NOT a Free Tier Anymore — Tier-1 ladder built on a $5 trial

**What goes wrong:**
The LLM swarm design lists Cerebras as a Tier-1 free provider. Cerebras ended its always-free tier (1M tokens/day, no card) in July 2026. Current offering is a one-time $5 trial credit that requires a verified payment method and expires 30 days after grant. After that, usage is pay-as-you-go Developer tier. Any traffic routed to Cerebras as "free overflow" either hard-fails (no card on file) or silently accrues charges (card on file) — violating the zero-monthly-cost constraint.

**Why it happens:**
Stale guides and aggregators still quote the old "1M free tokens/day" tier. Free-LLM lineups churn fast: Groq's free model list also rotated in 2026 (Llama 3.3, Kimi K2, DeepSeek left the free list; GPT-OSS and Qwen 3.x replaced them). A ladder designed against a snapshot rots within months.

**How to avoid:**
- Demote Cerebras to "paid-overflow, disabled by default" in the 2D ladder; never route autonomous traffic to it unless the owner explicitly enables a paid key.
- Re-base Tier-1 on currently-free providers only: Groq free tier (no card), GitHub Models, Mistral pool, Z.ai GLM-4.7-Flash, NVIDIA NIM/Cohere/OpenRouter :free — and re-verify each provider's free status at the start of the LLM-swarm phase and quarterly after.
- Build a provider-capability table (free? card required? expiry?) as config, not code, so a provider dying is a config flip, not a rewrite.
- Add a spend circuit-breaker: any provider client that returns a billing/quota error indicating paid usage immediately quarantines that provider and alerts, rather than retrying.

**Warning signs:**
- 401/403 or "add payment method" errors from Cerebras; trial-credit-expiry email; any invoice > $0.
- Aggregator pages (itsfree.ai-style) showing "credit card required" for a provider assumed free.

**Phase to address:**
LLM-swarm phase (Scout → Auditor pipeline). Provider table verification is a pre-condition; Cerebras stays out of the default rotation.

---

### Pitfall 3: Groq 429/413 design errors — treating all rejections as "retry later"

**What goes wrong:**
The pipeline stalls or busy-loops when Groq rejects requests, because three distinct failure modes get handled identically:
1. **429 RPM** (30 req/min/model) — transient; honor `Retry-After`, back off with jitter.
2. **429 TPD/RPD** (e.g., 200K tokens/day or 1,000 req/day on large models; wait can be 20+ min or until midnight UTC) — retrying in a tight loop burns the whole swarm's time and starves other work.
3. **413 "Request too large"** (single request exceeds the per-minute token budget, e.g., > 8K TPM on gpt-oss-120b) — retrying NEVER works; the request must shrink or move to a higher-budget model/provider.

Additional traps: limits are **per model per organization** (multiple API keys under one account share one pool — key rotation within one org does not multiply quota); the sanitizer's 85–90% token cut is load-bearing (without it, every Deep-Auditor prompt 413s); and `finish_reason: length` cutoffs silently truncate audits, producing confident-looking but incomplete verdicts.

**Why it happens:**
Developers test with short prompts under no load, see 200s, and ship a generic retry wrapper. The per-model/per-org pooling, the 413-vs-429 distinction, and the daily-cap wall only appear under sustained 24/7 autonomous load — exactly this project's operating regime.

**How to avoid:**
- Implement the PROJECT.md 2D per-model bucket rotation + `Task_Scratchpad` baton-pass exactly as specified: on 429, park only that model for the stated wait and fail over to the next model/provider; on 413, shrink (re-sanitize, split input) or escalate to a larger-budget model — never retry-as-is; on `finish_reason: length`, stitch (continue-from-offset) rather than accepting the partial output.
- Parse the error body: Groq names the limit (`tokens per minute (TPM)` vs `tokens per day (TPD)`) and the wait — route on that string, not just the status code. Respect `x-ratelimit-remaining-*` headers to pre-emptively shed load.
- Enforce prompt budgets client-side: estimate tokens before send; if estimate > 70% of the target model's TPM, sanitize harder or split first.
- Daily-cap bulkhead: track per-model daily token spend in PocketBase; when a model crosses ~80% of TPD, drain new work to other models instead of discovering the wall at 100% mid-audit.
- Flag any audit that ends with `finish_reason: length` as UNVERIFIED in the audit card — never route it as a verified alert.

**Warning signs:**
- Rising 429 rate in telemetry concentrated on one model; repeated 413s from Deep-Auditor (means sanitizer regressed or a new source emits huge pages); alerts routed with truncated reasoning.
- Midnight-UTC error cliffs (daily reset) followed by mid-day exhaustion — the swarm's demand exceeds one model's TPD; widen the ladder.

**Phase to address:**
LLM-swarm phase. Include a chaos test: force 429/413/length on each model and verify baton-pass + stitch behavior before connecting real pipelines.

---

### Pitfall 4: Shared-account pool contention — one org, many agents, one quota

**What goes wrong:**
Scout, Link-Hopper, Deep-Auditor, and Chief Curator all draw from the same per-organization quotas (Groq) or the same free account (GitHub Models, OpenRouter :free). A scrape burst fans out dozens of concurrent audits; the first agents consume the model's RPM/TPM, and every subsequent agent 429s — including the high-value Chief Curator final verdicts. The system does maximum work (tokens spent) for minimum output (verdicts blocked), and pipelines deadlock waiting on quota that resets at midnight UTC.

**Why it happens:**
Each agent is developed and tested in isolation with its own key; nobody models the aggregate. Free tiers have no request queuing — excess is rejected, not delayed — so contention manifests as errors, not slowness.

**How to avoid:**
- Centralize LLM access behind a single gateway (token-bucket per model per org) with priority lanes: Curator verdicts > Deep-Auditor > Scout triage. When quota is scarce, shed low-priority work first.
- Cap concurrent in-flight LLM calls globally (semaphore), sized from the tightest model in rotation (e.g., 5 req/min Cerebras-class limits inform the default).
- Stagger pipeline starts with jitter so three pipelines don't stampede the same model at :00/:30.
- Cache aggressively: identical URLs/pages re-audited within hours should hit PocketBase, not the LLM. Fingerprint-then-lookup before every paid/free-token spend.

**Warning signs:**
- 429 spikes correlated with poll boundaries (all pipelines firing at once); Curator verdict latency growing while Scout throughput stays flat; token spend up, alerts flat.

**Phase to address:**
LLM-swarm phase (gateway + priority lanes); verified again when the second and third pipelines come online.

---

### Pitfall 5: Playwright RAM spikes — one shared browser OOMs the VM

**What goes wrong:**
A single Chromium instance runs 400MB–1.5GB depending on page complexity. Unbounded contexts/tabs (`Promise.all` over a URL batch), pages never closed on error paths, JS-heavy pages accumulating heap over a 24/7 lifetime, and Docker-style `/dev/shm` exhaustion (64MB default → renderer crashes with zombie Playwright processes holding RAM) compound until the VM OOMs. On a 12–24GB Oracle box this also interacts with Pitfall 1: an OOM-killed scraper looks idle, accelerating reclaim risk.

**Why it happens:**
Dev machines have 32GB+ and short sessions; leaks never surface. The 24/7 + constrained-RAM regime turns every unclosed handle into a slow fuse. Playwright accumulates request/response/route objects per context — long-lived contexts grow even when pages are closed.

**How to avoid:**
- Enforce the PROJECT.md browser budget in code, not convention: 1 shared instance, max 2–3 queued tabs via semaphore, media (images/fonts) disabled, `--disable-dev-shm-usage` if containerized.
- `page.close()` + `context.close()` in `finally` on every path; recycle the whole browser process every N pages (e.g., 100–200) or hourly — process restart is the only reliable heap reset.
- Per-navigation timeouts + `context.route` abort for non-essential resource types; kill pages exceeding a memory or time budget instead of waiting.
- Export browser RSS as a telemetry gauge; alert at 70% of budget, recycle at 85%.

**Warning signs:**
- Browser RSS trending up across hours with no plateau; zombie `chrome` processes after crashes; OOM-killer entries in kernel log; scrapes timing out more often over days since restart.

**Phase to address:**
Scraper-foundation phase (sanitizer + browser manager). Load-test with a 24h soak of worst-case JS-heavy pages before adding LLM stages.

---

### Pitfall 6: Anti-ban and ToS failures — blocks, dead cookies, banned accounts

**What goes wrong (three sub-modes):**
- **a) IP/rate blocks:** Aggressive polling of portals (Unstop, Devfolio, ATS boards) trips WAF/anti-bot; the scraper gets 403s, CAPTCHAs, or IP-banned, and the pipeline ingests silence as "no new opportunities."
- **b) Session-cookie expiry (X/LinkedIn):** Burner cookies expire or get invalidated by a password reset / suspicious-login challenge. The poller keeps sending an authed session that now returns login walls; every fetch is wasted and the account may get flagged for repeated failed-logins.
- **c) ToS bans:** Discord self-bots (automating a normal user account outside the Bot API) are explicitly forbidden and lead to account termination. X/LinkedIn automation via logged-in sessions violates their ToS; LinkedIn's hiQ history shows public-page scraping likely isn't a CFAA crime, but it IS a breach of contract — hiQ ended with a $500K stipulated judgment, a permanent scraping injunction, and a data-deletion order (fake accounts and evasion were the aggravating facts). A banned Discord account kills all 10 alert channels at once; a banned X/LI burner kills that source.

**Why it happens:**
"APIs/RSS first, headless fallback" is the right order but teams drift: headless-first because it's uniform, poll intervals tightened "for freshness," one account used for everything because key management is tedious.

**How to avoid:**
- APIs/RSS first, always: headless is the fallback of last resort per source, with per-domain rate budgets and 45–90 min jitter on X/LI as specified. Prefer search-index fallbacks (Nitter-alternatives, search-engine caches, official RSS) over logged-in scraping wherever possible.
- Discord: Bot Gateway only (already specified) — never a user token, never a "lightweight custom client." Keep the bot token in the secret store (Pitfall 9), never in code.
- Cookie health probes: before each X/LI poll batch, fetch one known-good page; on login-wall signature, park that source, alert the owner to refresh the burner cookie, and fall back to search-index mode. Never hammer a dead session.
- Separate burners per source; no fake-account creation (the exact conduct that converted hiQ's win into a loss); no evasion tooling that defeats access controls on authenticated pages.
- Treat extended silence from any source as a possible block, not "no news": alert when a source returns zero items for 2× its poll interval.

**Warning signs:**
- Sudden 403/CAPTCHA/login-wall rate on one domain; cookie older than ~30 days without rotation; Discord "account disabled for automation" email; source silence exceeding 2 poll intervals.

**Phase to address:**
Each pipeline's source-integration work (events, jobs, loot phases separately) + a cross-cutting "source health" dashboard in the telemetry phase. ToS review is a gate before X/LI and Discord phases begin.

---

### Pitfall 7: Fuzzy-dedup false merges — distinct opportunities collapsed into one

**What goes wrong:**
The fuzzy duplicate merger decides "MLH Hackathon" and "MLH Fellowship info session" are the same event, or two Cutshort listings from the same company for different roles get merged. One survives with blended fields (wrong deadline, wrong link); the other is tombstoned permanently (Pitfall 11 makes this irreversible-ish). Users miss real opportunities — the exact failure the product exists to prevent.

**Why it happens:**
Title-similarity thresholds tuned on a small dev sample; no blocking keys (official URL, organizer + date); merger runs before verification, so two unverified items merge and the merged item inherits neither's evidence.

**How to avoid:**
- Two-stage dedup: exact fingerprint first (normalized URL → organizer+date → title trigram), fuzzy second with a HIGH threshold, and fuzzy merges require agreement on at least one hard key (same domain, overlapping date window, same organizer).
- Never merge across pipelines (event vs job vs loot) or across geo/prize buckets without curator confirmation.
- Keep merge provenance: merged-away IDs + reason + similarity score, reversible for 7 days before tombstone permanence. Surface merges in the audit card ("merged with #id2, score 0.91").
- Evaluate the merger on a labeled set of near-duplicates (same hackathon cross-posted on 3 portals = must-merge; same company two roles = must-not-merge) before enabling auto-merge; default to "flag, don't merge" below threshold.

**Warning signs:**
- User reports "wrong deadline/link" on alerts; merge rate spiking after adding a new source (new title conventions break the threshold); tombstone ledger growing faster than alert volume.

**Phase to address:**
Curator/dedup phase. Labeled eval set is an acceptance gate.

---

### Pitfall 8: INR prize parsing — credits, vouchers, and "worth up to" counted as cash

**What goes wrong:**
An event advertising "₹5,00,000 in prizes" turns out to be $6K in cloud credits + sponsor vouchers + "worth up to" retail valuations. The ₹1,00,000 liquid-cash gate passes on fiction, unverified alerts ship to Discord, and the channel's trust (the product's only asset) erodes. Variants: USD→INR converted at fantasy rates, prize-per-winner vs prize-pool confusion, "TBA prize" treated as passing.

**Why it happens:**
Prize blocks are marketing copy, not structured data. LLMs pattern-match "₹" + big number and stop reading. "Credits" vs "cash" requires actually parsing the prize-breakup section, which is often on a different page (hence the Link-Hopper) or in T&Cs.

**How to avoid:**
- Hard rule in the auditor prompt AND in code: strip credits/vouchers/swag/swag-worth from the cash total; only liquid cash (prize money, winner cheques) counts toward ₹1L. If the breakup can't be found after 2 hops, verdict = UNVERIFIED (TBA two-ping loop), never PASS.
- Normalize currency with a pinned conversion table (updated monthly, stored in Turso taste_rules — not LLM-estimated per audit).
- Require the audit card to cite the prize-breakup source span (page + quoted text). No quote, no PASS.
- Track false-PASS reports from #🧠-bot-training-chat as a precision metric; regress the prompt when precision drops.

**Warning signs:**
- Alerts whose prize quote mentions "credits," "worth," "up to," or sponsor names; user "this isn't cash" reactions; PASS rate suspiciously high on online events.

**Phase to address:**
Deep-Auditor prompt/rules phase + taste-learning loop phase.

---

### Pitfall 9: Seniority-filter false positives — 2yr+ and scam roles routed as fresher

**What goes wrong (both directions):**
- **False PASS:** "0–2 years," "junior (2+ preferred)," unpaid "fellowships," and pay-for-training scams slip through as 0–1yr/intern. Users apply, get rejected or scammed — trust damage, plus real harm in the scam case.
- **False REJECT:** Genuinely fresher-eligible roles ("freshers welcome," "0–1," "intern→PPO") get killed by an over-strict regex ("\d+\+?\s*yr" matches "0-1 yr" too), starving the jobs channel.

**Why it happens:**
Experience requirements live in free text with endless phrasing variance; regexes either over- or under-match. Scam signals (fee demands, Telegram-only contact, no company site) are a separate classifier that teams forget to build.

**How to avoid:**
- Auditor extracts the experience span as structured data (min_years, max_years, evidence quote) and applies the rule in code: PASS only if max ≤ 1 (or explicit intern/fresher tag); anything ambiguous → human-review queue, not auto-route.
- Separate scam screen with hard REJECT triggers: pay-for-training/registration fee, Telegram/WhatsApp-only application with no ATS or company domain, no verifiable company site. Scam REJECTs get logged but never alerted.
- Same labeled-eval approach as dedup: must-PASS / must-REJECT sets, with the scam cases weighted heavily.

**Warning signs:**
- "Requires 2 years" complaints; scam reports; jobs channel volume collapsing after a filter change (over-rejection).

**Phase to address:**
Jobs-pipeline rules phase. Scam screen ships with the first jobs slice, not later.

---

### Pitfall 10: Shipping-rule and loot-verification misses — US-only swag alerted to India users

**What goes wrong:**
"Free GitHub swag!" turns out to be US-shipping-only (or $40 shipping to India, or a form that rejects Indian addresses). Credit/voucher "loot" is actually a trial that requires a card, or expired. The loot channel becomes noise, and the trash-to-treasure divert gate (the differentiator) never fires because everything looks equally unverified.

**Why it happens:**
Shipping eligibility is usually NOT on the announcement page — it's in the claim form, FAQ, or terms, i.e., hop 2 that the Link-Hopper skips under load, or a form field the headless browser never submits.

**How to avoid:**
- Loot verification checklist enforced in code: shipping destinations (must include India/global), claim mechanism, expiry, card-required flag. Missing any field → UNVERIFIED, not PASS.
- The divert gate needs explicit thresholds (e.g., "under-₹X value but zero-friction claim + India shipping → divert channel, not main"), or it degrades to a second unfiltered feed.
- Re-verify loot expiry on a short loop (daily) — loot dies faster than events/jobs; stale loot alerts are the loot-channel equivalent of false prizes.

**Warning signs:**
- "Not available in India" replies; claim links that 404 or show expired; divert channel volume ≈ main channel volume (gate not discriminating).

**Phase to address:**
Loot-pipeline phase. Claim-form hop support is a prerequisite, not a stretch goal.

---

### Pitfall 11: Tombstone growth + midnight GC failures — cold ledger becomes a hot problem

**What goes wrong:**
Every rejected/expired/merged item writes a permanent fingerprint to Turso's tombstone_ledger. At 24/7 poll rates across dozens of sources, this grows unboundedly: storage creeps toward the 5GB free cap, and worse, every dedup check scans an ever-larger ledger — rows-read metering (500M/mo free; unindexed scans burn it fast) turns dedup into the biggest Turso consumer. If midnight GC fails silently (tunnel down, cron overlap — see Pitfalls 12/13), hot PocketBase fills with expired items that get re-alerted, and tombstones never compact.

**Why it happens:**
"Permanent fingerprints" is specified without a size bound or index plan. SQLite `VACUUM` is disabled on Turso, so storage never compacts itself. GC is a cron job nobody watches.

**How to avoid:**
- Fingerprint minimalism: store a 32-byte hash + tiny metadata (source, date, reason code), never full page text. Budget: N expected items/day × 100 bytes × 365 — verify against 5GB before building.
- Index the dedup lookup path (hash primary key — point lookups, not scans). Never `SELECT *` the ledger; never full-table-count it in a hot path.
- GC observability: midnight purge emits a telemetry event with counts (purged/compacted/errors); alert if GC hasn't succeeded in 25h. Make GC idempotent (re-runnable) so a failed night is recovered, not corrupted.
- If overages are disabled (they must be, for zero-cost), remember Turso returns `BLOCKED` on ANY exceeded metric — a full or over-read ledger halts ALL cold writes. Monitor rows-read/written against quota with a weekly burn-rate gauge.

**Warning signs:**
- Turso usage dashboard climbing faster than alert volume; dedup latency growing week-over-week; `BLOCKED` errors; GC success telemetry missing.

**Phase to address:**
Persistence phase (schema + indexes + fingerprint format) with a capacity model; GC alerting in the telemetry phase.

---

### Pitfall 12: Cron overlap stampedes — slow polls pile up and multiply load

**What goes wrong:**
A 15-min event poll takes 25 min (slow pages + LLM waits). The next tick starts anyway. Now two full pipelines run concurrently: double the browser tabs (Pitfall 5), double the LLM draw (Pitfall 4), double PocketBase writes, and both pipelines alert on the same items (dedup race). Each overlapping run is slower than the last — a stampede that ends in OOM or quota exhaustion.

**Why it happens:**
Interval-based scheduling (`setInterval` / naive cron) with no mutual exclusion and no duration tracking. Under normal conditions polls finish in time, so overlap only appears under exactly the degraded conditions where it's most dangerous.

**How to avoid:**
- Single-flight per pipeline: a new tick skips (with a telemetry counter) if the previous run is still active. Never queue more than one pending run.
- Track poll duration as a first-class metric; alert when p95 duration > 70% of the interval — that's the stampede warning.
- Decouple fetch from analyze: polls write raw items fast; LLM stages drain from a queue at their own pace. A slow auditor must never hold the next poll hostage.
- Jitter all intervals (already specified for X/LI — extend to everything) so pipelines don't align.

**Warning signs:**
- `skipped_overlapping_tick` counter > 0; poll duration trending up; duplicate alerts for the same item within minutes; browser tab count exceeding budget.

**Phase to address:**
Scheduler design in Phase 1 (before any pipeline). Single-flight is a framework property, not per-pipeline boilerplate.

---

### Pitfall 13: SSE fan-out + tunnel disconnects — dashboard kills the VM or goes dark

**What goes wrong (two faces):**
- **Fan-out load:** Rolling agent slots over PocketBase SSE seem cheap — until reconnect storms (tunnel flap → all clients reconnect → full state replays), or the owner leaves the dashboard open in 5 tabs. Each SSE stream costs memory and Ogniwo; unbounded streams on a box also defending reclaim margins is a real load.
- **Tunnel disconnects:** `cloudflared` drops (network flap, process death, Oracle maintenance). The dashboard goes dark AND the external health monitor (Pitfall 1) sees silence — but so does everything else. Worse: if the poller depends on tunnel-hosted anything, scraping halts. Tunnel death must be a dashboard-only outage, never a pipeline outage.

**Why it happens:**
SSE is "just an HTTP response" in dev; in production it's a stateful connection per viewer with replay semantics. Tunnels are treated as set-and-forget; nobody supervises the supervisor.

**How to avoid:**
- Zero Trust gate BEFORE any SSE/data render (already specified) — unauthenticated reconnect loops must die at the edge, not in PocketBase.
- Bound SSE cost: single shared event bus on the VM, one upstream subscription to PocketBase regardless of viewer count; cap concurrent dashboard viewers (owner-only makes this easy); heartbeat + exponential-backoff reconnect on the client.
- Supervise `cloudflared` (systemd `Restart=always`, or a process watchdog that restarts it and alerts). Health monitoring must distinguish "tunnel down, pipelines fine" (dashboard-only page, low urgency) from "VM down" (P0) — e.g., the VM pushes heartbeats OUT through the tunnel to an external checker AND the checker polls IN; down-out + down-in = VM dead, up-out + down-in = tunnel dead.
- Pipelines must have zero runtime dependency on the tunnel, the dashboard, or Discord availability. Alerts queue durably when Discord is unreachable and drain on recovery.

**Warning signs:**
- SSE connection count >> open tabs; memory spikes correlated with dashboard opens; "dashboard dark but Discord alerts still arriving" (tunnel-only failure — good-routed, but needs a restart); cloudflared restart loops in logs.

**Phase to address:**
Dashboard/telemetry phase (SSE bus + viewer caps) and Phase 1 (cloudflared supervision + dual-heartbeat monitoring).

---

### Pitfall 14: Secret leakage — bot tokens, cookies, and API keys end up in git/logs

**What goes wrong:**
Discord bot token, X/LinkedIn burner cookies, Cloudflare credentials, Turso auth tokens, and a dozen LLM API keys live in env files, get printed in debug logs ("request headers:"), pasted into error reports, or committed to the repo. A leaked Discord bot token lets anyone impersonate the alert system (spam/scam to all 10 channels); leaked cookies burn the burners; leaked Cloudflare certs expose the tunnel. Revocation is manual, multi-provider, and urgent.

**Why it happens:**
Greenfield speed: `.env` checked in "temporarily," verbose HTTP logging left on, cookies copied through chat/clipboard, one shared `.env` for all providers.

**How to avoid:**
- Secrets ONLY from environment (or a local-only secret file with 0600 perms, gitignored from day one). `.env.example` with placeholders is committed; real `.env` never is. Pre-commit hook scanning for token patterns (discord `MTA...`, `xox*`, `sk-*`, cookie strings).
- Redacting logger: a single HTTP/log helper that strips `Authorization`, `Cookie`, `token`, `key` fields. No raw header dumps anywhere in the codebase — grep-verify in CI.
- Cookie handling: burner cookies stored server-side only, rotated on a schedule, never logged, never transmitted except to the target domain. Session refresh is an owner-run script, not a dashboard feature (v1 read-only helps here).
- Separate keys per provider with minimal scope; document the revocation procedure per secret (where to rotate) in the runbook so a leak is a 10-minute drill, not an incident.

**Warning signs:**
- Secrets in `git log`/`git diff`; tokens visible in telemetry/logs; cookie age unknown; no record of where each secret is used/rotated.

**Phase to address:**
Phase 1 (before the first real credential exists). Retrofitting secret hygiene after tokens are in git history means rewriting history — do it first.

---

### Pitfall 15: TBA / rolling-deadline items rot — the two-ping loop nobody closes

**What goes wrong:**
Events with TBA prize/deadline enter the 48h two-ping loop, then... stay there. The re-check queue grows without bound (each item costs 2 hops + an audit per ping), items never graduate to PASS or permanent REJECT, and eventually someone "cleans up" by mass-PASSing stale TBAs — shipping unverified alerts (Pitfall 8 by another route).

**Why it happens:**
The loop specifies re-pings but no terminal state or budget. TBAs feel temporary, so nobody designs their ending.

**How to avoid:**
- Terminal states: after N pings (e.g., 3) with no resolution, item → EXPIRED-tombstone with reason `tba_unresolved`, freeing the budget. Re-entry only via fresh discovery (new fingerprint context), not automatic resurrection.
- Budget the loop: cap concurrent TBA-tracked items (e.g., 200); when full, oldest-unresolved drops out first. Track TBA inventory as a gauge.
- Deadline-passing sweep: any item whose event date passes while TBA → auto-expire, no ping wasted.

**Warning signs:**
- TBA inventory growing monotonically; ping cost (tokens + fetches) rising with no corresponding alert output; mass-manual-resolution events.

**Phase to address:**
Curator/rules phase, alongside the geo/prize bucket logic.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single shared LLM key per provider (no gateway) | Zero infra, works for 1 pipeline | Pool contention deadlock when pipelines × agents scale (Pitfall 4) | Never beyond first MVP slice — gateway is Phase-2 load-bearing |
| Regex-only seniority/prize filters, no LLM audit | Fast, deterministic, no tokens | False PASS/REJECT at scale; scam roles slip through (Pitfalls 8, 9) | Only as pre-filter before the auditor, never as the verdict |
| Headless-first scraping for all sources | Uniform code path | Bans, cookie burn, token waste (Pitfall 6) | Never — API/RSS-first is architectural |
| Storing full page text in tombstones | Easy debugging of merges | Turso storage + rows-read blowout (Pitfall 11) | Never — hashes + reason codes only |
| `setInterval` polling without single-flight | 5 lines of code | Stampedes under degradation (Pitfall 12) | Never — single-flight wrapper from day one |
| Verbose request/response logging for debugging | Fast diagnosis | Secret leakage into logs (Pitfall 14) | Only locally with redacting logger; never in production |
| One burner account for X + LinkedIn | Less cookie management | Correlated bans kill both sources at once (Pitfall 6) | Never |
| Manual VM rebuild ("I'll script it later") | Ship faster | Multi-day outage on reclaim (Pitfall 1) | Never — rebuild script is Phase-1 acceptance |
| Auto-merge fuzzy duplicates below 0.9 | Cleaner feeds fast | Irreversible false merges (Pitfall 7) | Only after labeled-eval gate passes; before that, flag-don't-merge |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|---------------|------------------|
| Oracle OCI | Assuming "running cron = active"; watching CPU only | Track all three reclaim metrics (CPU p95 + net + mem mean); memory buffer ≥22%; external watchdog + rebuild runbook |
| Groq | One retry policy for all errors; key rotation to "multiply" quota | Route on error body (RPM-429 vs TPD-429 vs 413); org-level pools — keys don't multiply quota; client-side prompt budgets |
| Cerebras | Treating as free Tier-1 | Disabled by default; $5 trial needs a card and expires in 30d; config-flagged, spend-breakered |
| Discord | Self-bot/user-token shortcuts; token in code | Bot Gateway via discord.js; token from env only; alert queue survives Discord outages |
| X / LinkedIn | Hammering dead sessions; fake accounts; evasion tooling | Cookie health probe → park + fallback to search-index; burners per source; no fake accounts (hiQ lesson) |
| PocketBase | Treating local SQLite as durable | Hot only; continuous bounded-lag replication to Turso; rebuild-tested |
| Turso | `SELECT *` scans; full-text tombstones; ignoring quotas | Point lookups on hash PK; minimal fingerprints; burn-rate gauge; overages OFF + `BLOCKED` handling |
| Cloudflare Tunnel | Unsupervised cloudflared; pipelines depending on tunnel | systemd supervision; dual-heartbeat (push-out + poll-in) monitoring; pipelines tunnel-independent |
| Cloudflare Zero Trust | App-level auth instead | Edge wall before UI/SSE (already decided); unauth dies at edge |
| ATS boards (Greenhouse/Lever/Ashby) | Scraping HTML when JSON APIs exist | Use the documented JSON endpoints first (they're stable and ToS-friendlier); headless only for Workday-type JS walls |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded Playwright tabs/contexts | RSS climbs to OOM over hours/days | Semaphore (2–3 tabs), close-in-finally, hourly browser recycle | ~50+ pages/session on 12GB box; faster with JS-heavy pages |
| Tombstone ledger full scans | Dedup latency grows weekly; Turso rows-read burns | Hash-PK point lookups; minimal records; no hot-path scans | ~100K+ tombstones with unindexed access |
| SSE reconnect storms | Memory/CPU spike when dashboard opens/flaps | Shared event bus, viewer cap, backoff reconnect | 3+ tabs × tunnel flap, or any unauth retry loop |
| Midnight GC + polls colliding | Slow polls, lock contention, skipped ticks | GC on its own schedule with jitter, idempotent, single-flight aware | First GC night with a full hot DB |
| LLM stampede at poll boundaries | 429 wall at :00/:30, verdict starvation | Staggered + jittered starts, gateway priority lanes, fetch/analyze decoupling | 2nd pipeline online (load ×2–3 overnight) |
| Sanitizer regression (a source changes markup) | 413s spike, token spend jumps 5–10× | Token-estimate-before-send + 413 alerting; per-domain sanitizer tests | First unstyled/JS-dump page from a new source |
| TBA loop unbounded | Ping cost grows, inventory never shrinks | Terminal states + inventory cap + date-pass sweep | ~months of accumulation |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Bot token / API keys in git or logs | Full impersonation of alert system; quota theft | Env-only secrets, gitignored from day one, redacting logger, pre-commit scan |
| Burner cookies logged or transmitted loosely | Account takeover of burners; source loss | Server-side only, never logged, domain-scoped sending, rotation schedule |
| Cloudflare tunnel credentials on disk unprotected | Direct path to owner-only dashboard + VM | 0600 perms, supervised install, rotate per runbook |
| Zero Trust misconfigured (bypass rules, open SSE path) | Public access to telemetry + opportunity data | Deny-by-default, verify SSE path covered, test from unauthenticated network |
| Scraped content rendered unescaped in Discord embeds/dashboard | Stored XSS via malicious event descriptions | Escape all scraped strings at render; Discord embed field limits enforced (truncate, don't crash) |
| Fake accounts / evasion tooling for scraping | Contract liability à la hiQ ($500K + injunction + deletion) | No fake accounts, no access-control defeat on authed pages, public-data-only posture |
| No revocation runbook | Hours-long exposure after any leak | Per-secret rotation procedure documented and drill-tested in Phase 1 |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Unverified alerts labeled like verified ones | Users can't tell TBA guesses from audited facts; trust erodes on first error | Audit card always shows verdict tier (VERIFIED / UNVERIFIED-TBA / DIVERTED) with evidence quote + source link |
| Deadline reminders without timezone | "Apply by 11:59" — whose midnight? Missed deadlines | Always render IST + source timezone; flag ambiguous-time items as UNVERIFIED-time |
| 10 channels with no digest | Alert fatigue; users mute everything | Per-channel digest/threading, bookmark reactions (already specified), deadline reminders only for bookmarked items |
| Silent source death (no alerts for days) | Users assume "no opportunities" when the scraper is actually blocked | Source-health indicator (even a simple "last successful poll" per source in the dashboard + silence alerts to owner) |
| Merged duplicates with no provenance | "Wrong link" reports with no way to diagnose | Merge provenance on the audit card (merged IDs + score), reversible 7 days |

## "Looks Done But Isn't" Checklist

- [ ] **Scraper "works":** Often missing error-path tab closes + browser recycle — verify with a 24h soak, RSS flat, zero zombie processes.
- [ ] **LLM pipeline "works":** Often missing 413 handling + length-stitch — verify by forcing a 413 and a `finish_reason: length` and watching baton-pass/stitch recover without re-scraping.
- [ ] **Dedup "works":** Often missing the must-not-merge eval — verify same-company-different-role and cross-pipeline pairs stay separate.
- [ ] **Prize gate "works":** Often missing the credits-strip test — verify a credits-heavy page verdicts UNVERIFIED/PASS-correctly with a cited breakup quote.
- [ ] **Jobs filter "works":** Often missing scam cases — verify pay-for-training and Telegram-only listings hard-REJECT.
- [ ] **Loot "works":** Often missing the shipping check — verify a US-only swag item does NOT reach the main channel.
- [ ] **Persistence "works":** Often missing the rebuild drill — verify by actually wiping and rebuilding from Turso; measure data loss window.
- [ ] **Scheduler "works":** Often missing overlap behavior — verify by forcing a poll to exceed its interval and confirming single-flight skip + counter.
- [ ] **Dashboard "works":** Often missing the unauth test + tunnel-death test — verify from an outside network and by killing cloudflared (pipelines must continue, alerts must queue).
- [ ] **Secrets "work":** Often missing the git-history check — verify with a secret scan over full history, not just HEAD.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Oracle reclaim (VM deleted) | HIGH (hours + data gap) | Re-provision from rebuild script → restore PocketBase seed from Turso → verify pollers + tunnel + bot → post-mortem on which metric went idle |
| Cerebras billing surprise | LOW–MEDIUM ($ + re-route) | Disable provider in config → dispute/close trial → re-balance ladder → add spend-breaker so it can't recur |
| Groq daily-cap wall mid-day | MEDIUM (lost coverage) | Drain to next-tier models immediately → widen ladder / add providers → next-day retro on per-model budgets |
| Shared-pool deadlock | MEDIUM | shed low-priority (pause Scout), let Curator drain → add gateway priority lanes permanently |
| Browser OOM | LOW (restart) / HIGH if cascading | Recycle browser process (auto) → if VM OOM, reboot + soak-test to find the leak path → enforce tab budget in code |
| Source IP block | MEDIUM (days of silence) | Park source → fall back to RSS/search-index → rotate egress if available → back off for days, not minutes |
| Dead X/LI cookie | LOW | Owner refreshes burner via script → health probe green → resume; no code change if park/fallback exists |
| Discord account/bot disabled | HIGH (all channels dark) | Appeal + rotate to backup application/bot → drain queued alerts → post-mortem; self-bot cause means rebuilding compliant |
| False-merge damage | MEDIUM | Unmerge from 7-day provenance log → restore tombstoned item → tighten threshold + add regression pair to eval set |
| Turso BLOCKED (quota) | HIGH (cold writes halt) | Identify burning query (usually a scan) → index + kill scan → emergency purge of oversized records → consider Developer $5/mo or reduce poll retention |
| Tunnel down | LOW | Restart cloudflared (auto via supervisor) → verify dual-heartbeat → dashboard back; pipelines should never have noticed |
| Secret leak | HIGH (rotation + history) | Revoke/rotate affected secret everywhere → purge from git history (filter-repo) + rotate any secret sharing the commit → runbook drill retro |
| Cron stampede | MEDIUM | Kill overlapping runs → enable single-flight (should already exist) → stagger intervals → decouple fetch from analyze |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Oracle reclaim + rebuild | Phase 1: Foundation (VM + PocketBase + Turso + tunnel) | Reclaim-metric dashboard green 7+ days; rebuild drill succeeds; external watchdog paging tested |
| Secret hygiene | Phase 1 (before first credential) | Secret scan over history clean; redacting logger grep-verified; rotation runbook written |
| Scheduler single-flight | Phase 1 (framework property) | Forced-overlap test shows skip + counter |
| Tunnel supervision + dual-heartbeat | Phase 1 | Kill-cloudflared test: dashboard darks, pipelines continue, alerts queue |
| Browser budget + recycle | Scraper-foundation phase | 24h soak: RSS flat, no zombies, tab budget never exceeded |
| API/RSS-first per source | Each pipeline phase (events, jobs, loot) | Per-domain fetch-mode audit (API vs headless ratio); block-rate telemetry |
| Groq 429/413/length handling | LLM-swarm phase | Chaos test: forced 429/413/length all recover via baton-pass/stitch |
| Shared-pool gateway + priorities | LLM-swarm phase (hardened at 2nd pipeline) | Contention sim: Curator verdicts unaffected during Scout burst |
| Cerebras de-listing + provider table | LLM-swarm phase (pre-condition) | Provider table reviewed; Cerebras disabled; spend-breaker tested |
| Fuzzy-dedup eval gate | Curator/dedup phase | Labeled must-merge/must-not-merge set passes; default flag-don't-merge below threshold |
| Prize-credit stripping | Deep-Auditor rules phase | Credits-heavy fixture verdicts correctly with cited quote |
| Seniority + scam screen | Jobs-pipeline phase | Must-PASS/must-REJECT/scam eval sets pass; scam REJECTs logged-not-alerted |
| Loot shipping verification | Loot-pipeline phase | US-only fixture stays out of main channel; divert gate discriminates |
| TBA terminal states + caps | Curator/rules phase | TBA inventory bounded; unresolved items expire with reason code |
| Tombstone sizing + indexes + GC alerts | Persistence phase + telemetry phase | Capacity model vs 5GB; dedup p95 latency flat; GC success telemetry present |
| SSE bus + viewer caps + Zero Trust edge test | Dashboard/telemetry phase | Unauth probe denied at edge; reconnect storm sim stays within budget |
| ToS review (Discord Gateway, X/LI posture) | Gate before Discord + X/LI integration work | No user-tokens/self-bots in code (grep); cookie park/fallback tested; no fake accounts |

## Sources

- Oracle Always Free documentation — idle reclaim rule (CPU p95 <20% AND network <20% AND memory mean <20% on A1, 7-day window; thresholds revised 10%→15%→20% historically) — HIGH confidence (official docs + community recomputation, Jul 2026)
- Groq rate-limits documentation via console.groq.com/docs/rate-limits and independent trackers (per-model RPM/RPD/TPM/TPD; 30 RPM; 6–8K TPM / 200–500K TPD free; 429 vs 413 semantics; org-level pooling; gpt-oss/Qwen 3.x free lineup post-2026 rotation) — HIGH confidence (official docs, verified Sep–Oct 2026)
- Cerebras pricing page + free-tier trackers (always-free 1M/day ended Jul 2026; current $5 one-time 30-day trial, card required; 5 req/min trial envelope) — HIGH confidence (official pricing + multiple trackers, Sep 2026)
- Discord support article "Automated User Accounts (Self-Bots)" — self-bots forbidden, account termination — HIGH confidence (official)
- hiQ v. LinkedIn litigation record (9th Cir. CFAA public-data holding; Nov 2022 breach-of-contract ruling; Dec 2022 stipulation: $500K judgment, permanent injunction, data deletion; fake accounts as aggravating conduct) — HIGH confidence (court opinions + legal analysis)
- Turso pricing/usage docs (free: 5GB, 500M rows read, 10M writes/mo; `BLOCKED` on any exceeded metric without overages; rows-read metering; `VACUUM` disabled) — HIGH confidence (official docs + pricing page)
- Playwright production-memory experience (400MB–1.5GB per Chromium; context-scoped accumulation; `/dev/shm` crashes; close-in-finally; pool/semaphore; `--disable-dev-shm-usage`) — MEDIUM confidence (maintainer statements + production post-mortems; exact numbers workload-dependent)
- Supabase pause behavior (project pauses after ~1 week idle — community knowledge; architectural rationale for the PocketBase-hot decision, no separate verification needed beyond the decision record) — MEDIUM confidence

---
*Pitfalls research for: Zod autonomous opportunity-intelligence swarm (zero-cost 24/7 scraper + free-LLM swarm)*
*Researched: 2026-10-15*
