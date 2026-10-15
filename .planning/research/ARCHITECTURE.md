# Architecture Research

**Domain:** Autonomous multi-agent ingestion → verify → route (opportunity-intelligence swarm)
**Researched:** 2026-10-15
**Confidence:** MEDIUM (SDK docs verified via Context7 for PocketBase/Playwright/discord.js; pipeline/orchestrator patterns from established multi-agent scraping practice; LLM-router and scratchpad mechanics are project-specific design, validated by reasoning not external source)

## Standard Architecture

Standard practice for autonomous scraper/verifier/router systems is a **layered pipeline with a central orchestrator, not a mesh of peers**. Ingestion, verification, and routing are separate stages connected by a durable work-state store — never direct agent-to-agent calls. This is the correct shape for Zod.

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      INGESTION LAYER (producers)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Events   │  │ DK/Udupi │  │ Jobs/    │  │ Discord relay +  │  │
│  │ portals  │  │ local    │  │ Fellow-  │  │ X/LinkedIn       │  │
│  │ sched    │  │ crawler  │  │ ships    │  │ watchers         │  │
│  │ 15–30m   │  │ 2–4h     │  │ 30–60m   │  │ 45–90m jitter    │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       └─────────────┴────────────┴─────────────────┘           │
├───────────────────────────┴─────────────────────────────────────┤
│                   ORCHESTRATION LAYER (single brain)             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Orchestrator: per-pipeline schedulers + jitter, dedup     │  │
│  │ gate (fingerprint check) → Task_Scratchpad STEP_1..4      │  │
│  │ state machine → Scout → Link-Hopper → Deep-Auditor →     │  │
│  │ Chief Curator → Router                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Shared Playwright│  │ Sanitizer stage  │  │ 2D LLM key/   │  │
│  │ browser queue    │  │ (strip→markdown) │  │ model router  │  │
│  │ (max 2–3 tabs)   │  │                  │  │ + cooldowns   │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      MEMORY LAYER (hot + cold)                   │
│  ┌───────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ PocketBase HOT    │  │ Turso COLD      │  │ Midnight GC    │  │
│  │ opportunities +   │  │ tombstone_ledger│  │ purge job      │  │
│  │ agent_telemetry   │  │ + taste_rules   │  │ (PB↔Turso sync)│  │
│  │ (SSE source)      │  │ (survives VM    │  │                │  │
│  │                   │  │  rebuild)       │  │                │  │
│  └───────────────────┘  └────────────────┘  └────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      EGRESS LAYER (consumers)                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Discord router + │  │ SSE dashboard    │  │ cloudflared   │  │
│  │ formatter (10 ch)│  │ (slots/health/  │  │ tunnel + Zero │  │
│  │                  │  │  boards, r/o)    │  │ Trust gate    │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Per-pipeline schedulers | Own poll cadence per source class; apply jitter; enqueue raw URLs, never scrape inline | `node-cron`/setInterval per pipeline with jitter wrapper; push to scratchpad STEP_1 |
| Orchestrator | Owns Task_Scratchpad lifecycle; dedup gate first; advances STEP_1→4; baton-pass on 429/413 | Single Node process, event-loop driven; scratchpad row in PB is the state token |
| Task_Scratchpad state machine | Atomic per-item work record: STEP_1 discovered → STEP_2 fetched/sanitized → STEP_3 audited (partial_stream_buffer on 413/length-cut) → STEP_4 routed; holds fingerprint, hop count, model used | PB collection `task_scratchpad` (or in-memory + PB mirror); single-writer updates |
| Shared Playwright browser queue | Exactly 1 browser instance; FIFO queue, max 2–3 concurrent pages; images/fonts off; per-nav timeout + close discipline | `chromium.launch()` once; semaphore (p-limit=2); isolated context per job (X/LI cookies isolated) |
| Sanitizer stage | Strip scripts/styles/SVG/nav → markdown; 85–90% token cut BEFORE any LLM call | Crawl4AI or Jina Reader for API/RSS-first sources; Playwright `page.content()` + readability/turndown fallback |
| 2D LLM key/model router | Per-(provider, model) buckets with independent cooldowns; tier order; 429→cooldown+next bucket; 413→shrink input + resume via partial_stream_buffer; length-cut→stitch prompt | Router module with bucket map `{tokens, resetAt, cooldownUntil}`; never global backoff |
| Link-Hopper | Max 2 hops (Feed→Aggregator→Official/ATS); each hop re-queues through browser queue + sanitizer | Hop counter on scratchpad; hop 3 = reject with reason |
| Deep-Auditor + Chief Curator | Apply domain rule packs (event/job/loot); output structured verdict + routing target | LLM call with rule-pack system prompt; JSON-schema output; Curator is final gate, can veto |
| PocketBase hot store | `opportunities` (canonical records), `agent_telemetry` (append-only ring, capped), scratchpad; SSE source for dashboard | PB single binary, SQLite WAL, local disk; JS SDK `subscribe("*")` with filters |
| Turso cold store | `tombstone_ledger` (permanent fingerprints of rejected/routed/expired) + `taste_rules` (learned preferences); survives VM rebuild | libsql client; batched writes (not per-item); read on boot to warm dedup cache |
| Midnight GC | Purge expired scratchpad + trim telemetry ring; reconcile PB tombstones → Turso; hold Oracle RAM 22–30% | Cron 00:00; delete-where-expired; telemetry cap (e.g. keep last N per agent) |
| Discord router/formatter | Map verdict→1 of 10 channels; compact audit-card embeds (title ≤256, ≤25 fields); deadline reminders; bookmark reactions; taste-vote ingestion from #🧠-bot-training-chat | discord.js v14; GatewayIntentBits Guilds/GuildMessages/GuildMessageReactions + Partials Message/Channel/Reaction; native Gateway relay for #announcements, never self-bot |
| SSE dashboard | Read-only: rolling agent slots, 2D pool-health grid, opportunity/audit boards; subscribes PB SSE server-side, pushes to browser | Small server (same VM) proxying PB realtime; Zero Trust gate in front covers SSE too |
| cloudflared tunnel | Outbound-only link VM→Cloudflare edge; zero inbound ports; Zero Trust Access owner-only policy | `cloudflared` daemon + tunnel UUID; firewall blocks all inbound |

## Recommended Project Structure

```
src/
├── orchestrator/         # scheduler registry, STEP machine, baton-pass
│   ├── schedulers/       # events.ts, local.ts, jobs.ts, social.ts (cadence+jitter)
│   ├── scratchpad.ts     # STEP_1..4 transitions, partial_stream_buffer
│   └── dedup.ts          # fingerprint (normalized URL+title+date) vs tombstones
├── agents/               # Scout, LinkHopper, DeepAuditor, ChiefCurator
│   └── rules/            # event-rules.ts, job-rules.ts, loot-rules.ts (rule packs)
├── browser/              # shared instance, FIFO queue (p-limit=2), nav wrappers
├── sanitizer/            # crawl4ai/jina first, playwright+readability fallback
├── llm/                  # 2D router: buckets, cooldowns, tier order, stitch
│   ├── router.ts
│   └── buckets.ts
├── memory/               # PB client, Turso client, GC job
│   ├── pocketbase.ts     # opportunities, agent_telemetry, scratchpad
│   ├── turso.ts          # tombstone_ledger, taste_rules
│   └── gc.ts             # midnight purge + reconcile
├── discord/              # router (verdict→channel), formatter (audit cards), reactions
├── dashboard/            # SSE proxy + read-only boards API
└── infra/                # cloudflared config, Oracle setup, Zero Trust notes
```

### Structure Rationale

- **orchestrator/ separate from agents/:** schedulers and state machine outlive any single agent implementation; agents stay swappable rule-appliers.
- **llm/ as its own module:** the 2D router is the single hardest reliability component — isolate it so every agent calls one `complete()` facade and never touches keys directly.
- **memory/ split PB vs Turso:** hot path (PB, sync, local) and cold path (Turso, batched, remote) have opposite latency/error profiles; separate clients enforce that.
- **discord/ split router vs formatter:** channel mapping changes with taste; card layout changes with embed limits — independent churn.

## Architectural Patterns

### Pattern 1: Scratchpad-as-state-token (durable pipeline state)

**What:** Every opportunity is a row moving STEP_1→STEP_4. Agents never call each other; they read the scratchpad row, do their stage, write back. A 429/413 mid-STEP_3 writes `partial_stream_buffer` + baton note, and the next eligible model resumes — no re-scrape.
**When to use:** Always here — this is what makes the system crash-safe on a preemptible free-tier VM.
**Trade-offs:** + survives restarts/idle-reclaim; + single-writer audit trail. − PB write per transition (local SQLite, negligible).

**Example:**
```typescript
// agents never chain directly — orchestrator advances the token
await scratchpad.transition(id, "STEP_3", {
  auditorOutput: partial,                 // may be incomplete
  partial_stream_buffer: truncated ? tail : null,
  nextModel: router.pickNext(failedBucket), // baton-pass, no re-scrape
});
```

### Pattern 2: Shared-browser semaphore queue

**What:** One `chromium.launch()`, one FIFO queue, concurrency 2 (3 burst). Each job: new isolated context → goto with timeout → content → close context. Media (images/fonts) disabled at context level.
**When to use:** Mandatory under the 1-instance / 2–3-tab constraint and Oracle ARM RAM budget.
**Trade-offs:** + bounded RAM, cookie isolation per job (X/LI sessions don't leak). − throughput cap; slow sources head-of-line-block (mitigate: per-pipeline sub-queues or priority for Deep-Auditor over Scout).

**Example:**
```typescript
import { chromium } from "playwright";
import pLimit from "p-limit";
const browser = await chromium.launch({ headless: true });
const slots = pLimit(2); // max 2 concurrent tabs
const html = await slots(async () => {
  const ctx = await browser.newContext({ javaScriptEnabled: true });
  await ctx.route("**/*.{png,jpg,svg,woff2}", (r) => r.abort()); // media off
  const page = await ctx.newPage();
  try { await page.goto(url, { timeout: 30_000 }); return await page.content(); }
  finally { await ctx.close(); } // close discipline — leak = OOM on ARM
});
```

### Pattern 3: 2D per-bucket cooldown router (no global backoff)

**What:** Buckets keyed (provider × model), each with own `cooldownUntil`. 429 cools only that bucket and routes to next; 413 shrinks that bucket's max-input and retries same model with truncated input; length-cut appends a stitch prompt carrying `partial_stream_buffer`.
**When to use:** Always with free-tier LLM pools — global backoff wastes the healthy 90% of the pool.
**Trade-offs:** + pool throughput survives single-model exhaustion. − bookkeeping complexity; needs telemetry per bucket (feed into the 2D pool-health grid — same data structure serves ops).

### Pattern 4: Hot/cold memory split with permanent fingerprints

**What:** PB holds live records + telemetry ring (fast, local, capped). Turso holds `tombstone_ledger` (every fingerprint ever seen: routed, rejected, expired) + `taste_rules`. Dedup checks memory-cached tombstones first, PB second. GC reconciles nightly.
**When to use:** Any 24/7 free-tier box that can be reclaimed — cold store is the rebuild survival kit.
**Trade-offs:** + zero duplicate re-alerts across rebuilds; + taste persists. − eventual consistency (Turso writes batched; accept seconds of lag).

## Data Flow

### Request Flow (one opportunity, end to end)

```
Scheduler fires (cadence + jitter)
    ↓ enqueue raw URL
Dedup gate: fingerprint vs tombstone cache → known? DROP + telemetry
    ↓ STEP_1 (discovered)
Browser queue → fetch → Sanitizer (strip → markdown, 85–90% cut)
    ↓ STEP_2 (sanitized markdown attached)
Link-Hopper (≤2 hops, each hop re-enters browser queue + sanitizer)
    ↓
Deep-Auditor via LLM router (rule pack by pipeline) → verdict JSON
    ↓ STEP_3 (audited; partial_stream_buffer if 413/length-cut + stitch)
Chief Curator final gate (veto/approve + channel target)
    ↓ STEP_4 (routed)
Discord router → audit-card embed → channel; PB opportunities upsert;
Turso tombstone write (batched); telemetry append
```

### State Management

```
Task_Scratchpad row (PB) = single source of truth per item
    ↓ (orchestrator polls/subscribes transitions)
Agents = stateless stage functions (row in → row out)
    ↓
opportunities (PB hot) ←→ tombstone_ledger (Turso cold, nightly reconcile)
agent_telemetry ring (PB, capped, SSE → dashboard slots/health grid)
```

### Key Data Flows

1. **Ingest→verify:** schedulers → dedup → browser queue → sanitizer → scratchpad STEP_2. No LLM touched before sanitization (token budget rule).
2. **Verify→route:** auditor → curator → Discord router + PB upsert + tombstone batch. Router is the ONLY Discord writer (single-writer audit trail).
3. **Learn loop:** bookmark reactions + #🧠-bot-training-chat votes → `taste_rules` (Turso) → loaded into curator prompts at boot/refresh.
4. **Observe:** PB SSE (`subscribe("*")` on opportunities + agent_telemetry) → dashboard proxy → browser; Zero Trust gates both UI and SSE at edge.
5. **Decay:** midnight GC purges expired scratchpad/opportunities, trims telemetry ring, pushes tombstones to Turso, frees RAM buffer.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–3 pipelines (now) | Monolith single process is correct; in-process queues, one browser, one PB. Do not split. |
| +sources / +volume | First split: separate browser-queue workers per pipeline priority; then separate auditor concurrency via router buckets. PB still fine (local SQLite WAL handles this volume easily). |
| Beyond free tier | Only then: PB→Postgres, queue→Redis/BullMQ, multi-VM. Not on roadmap until Oracle ARM saturates. |

### Scaling Priorities

1. **First bottleneck:** Playwright tabs (RAM + head-of-line blocking). Fix: priority lanes (Auditor > Hopper > Scout), per-nav timeouts, strict close discipline.
2. **Second bottleneck:** LLM free-tier rate limits at poll peaks. Fix: more buckets (breadth), smaller sanitized inputs (depth), off-peak scheduling for DK/Udupi + X/LI watchers.

## Anti-Patterns

### Anti-Pattern 1: Agents calling agents directly

**What people do:** Scout invokes Auditor invokes Router as function calls.
**Why it's wrong:** A 429/413 or VM reclaim mid-chain loses everything; no resume, no audit trail, retries re-scrape.
**Do this instead:** Scratchpad token + orchestrator advancement; every stage boundary is a durable write.

### Anti-Pattern 2: Global LLM backoff / single key

**What people do:** One key, on 429 sleep-and-retry everything.
**Why it's wrong:** One exhausted model stalls all three pipelines; free tiers 429 constantly.
**Do this instead:** 2D per-bucket cooldowns; the pool degrades gracefully bucket by bucket.

### Anti-Pattern 3: Raw HTML into the LLM

**What people do:** Pipe `page.content()` straight to the model.
**Why it's wrong:** 10x token burn, 413 errors, free-tier bankruptcy in hours.
**Do this instead:** Sanitizer stage is mandatory and ordered BEFORE any LLM call; API/RSS-first so the browser is the fallback, not the default.

### Anti-Pattern 4: Dashboard writing to the store

**What people do:** Add approve/reject buttons that mutate opportunities.
**Why it's wrong:** Breaks single-writer audit trail; taste learns from reactions/votes, not edits.
**Do this instead:** v1 dashboard strictly read-only over SSE; all learning flows through Discord reactions + training chat.

### Anti-Pattern 5: Inbound ports on Oracle

**What people do:** Open 3000/8080 in the security list for the dashboard.
**Why it's wrong:** Exposes origin; scanners find it within hours.
**Do this instead:** cloudflared outbound-only tunnel; firewall denies all inbound; Zero Trust Access policy is the only gate.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Discord Gateway | discord.js v14 client; intents Guilds/GuildMessages/GuildMessageReactions; embeds for audit cards | Native relay of #announcements via Gateway (no self-bot — ToS ban risk); embed limits force compact cards + official-source links |
| X / LinkedIn | Burner session cookies in isolated contexts + 45–90m jitter + search-index fallback | Highest ban-risk integration; isolate cookies per context, human pacing, never default path |
| Turso | libsql batched writes, bulk read on boot | Free 5GB/500M reads is ample; batch tombstones, don't write per-item synchronously |
| Cloudflare edge | cloudflared daemon + tunnel UUID; Access policy owner-only | Covers SSE streams too; Pages/Vercel dashboard → tunnel hostname |
| LLM providers (Groq/Cerebras/GH Models/SambaNova/T2) | HTTPS via 2D router facade | Keys in env only; per-bucket usage telemetry feeds health grid |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Schedulers ↔ Orchestrator | In-process enqueue → scratchpad STEP_1 | Schedulers never scrape; orchestrator never polls sources directly |
| Agents ↔ Browser queue | `fetch(url)` facade returning sanitized markdown | Agents never touch Playwright APIs; queue owns all close discipline |
| Agents ↔ LLM router | `complete(prompt, budget)` facade | Agents never see keys/tiers; router owns cooldowns + stitch |
| Orchestrator ↔ Memory | PB sync writes per transition; Turso batched | Hot path never blocks on cold store |
| Router ↔ Discord | Sole `send(channel, embed)` writer | Formatter builds embeds; router maps verdict→channel |

## Build-Order Dependencies

Phases must respect this order (each layer's contract is the next layer's prerequisite):

1. **Memory + scratchpad first** (PB collections: opportunities, agent_telemetry, task_scratchpad; Turso ledger/rules; fingerprint function) — everything writes here; no contract, no pipeline.
2. **Browser queue + sanitizer** — the fetch contract (`url → markdown`) all agents depend on; verify token-cut % here.
3. **LLM router skeleton** (2 buckets + cooldowns + facade) — auditors can't run without it; expand tiers later.
4. **One vertical slice:** Events scheduler → Scout → Auditor → Curator → Discord (1 channel) — first end-to-end alert proves the whole data flow.
5. **Remaining pipelines** (Jobs, DK/Udupi, social watchers) + rule packs + Link-Hopper — parallelizable once the slice works.
6. **Taste loop + reminders + GC + dashboard + tunnel** — ops polish; dashboard needs live PB data to be meaningful, so it comes after pipelines run.

## Sources

- PocketBase JS SDK realtime/SSE subscribe internals — Context7 `/pocketbase/js-sdk` (MEDIUM)
- Playwright shared browser/contexts, close discipline — Context7 `/microsoft/playwright` (MEDIUM)
- discord.js v14 channels/embeds/reactions/intents — Context7 `/discordjs/guide` (MEDIUM)
- Cloudflare Tunnel outbound-only + Zero Trust model — developers.cloudflare.com via WebFetch (LOW, single source — re-verify tunnel config flags during infra phase)
- Orchestrator/scratchpad/router/queue patterns — project-requirement-derived design, no external authority claimed (gap: phase-level research should validate p-limit vs BullMQ choice and Crawl4AI vs readability token-cut claims)

---
*Architecture research for: autonomous multi-agent ingestion→verify→route swarm (Zod)*
*Researched: 2026-10-15*
