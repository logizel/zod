# Zod — Autonomous Opportunity-Intelligence Swarm

Zod is a self-hosted, 24/7 autonomous multi-agent system that discovers, audits, deduplicates, and routes high-signal technical opportunities across three parallel pipelines: tech events/hackathons, fresher/intern jobs, and zero-cost developer perks. It exposes a split-channel interface: a Discord bot for routed alerts across 10 channels plus a locked real-time web telemetry dashboard (read-only v1) behind Cloudflare Zero Trust.

**Core Value:** Only verified, deduplicated, high-signal opportunities reach Discord — every online event has audited cash ≥₹1,00,000 or a real perk with India shipping, every job is true 0–1yr/intern, every alert links the official source.

## Constraints

- **Cost**: Zero monthly infra + LLM — permanent free tiers only
- **Compute**: Oracle ARM idle reclaim — hold 22–30% RAM via 2.5GB cache buffer
- **Hop**: Link-Hopper hard max 2 hops (Feed → Aggregator → Official/ATS)
- **Browser**: 1 shared instance, max 2–3 queued tabs, media loading off
- **Polling**: Events 15–30m, DK/Udupi 2–4h, Jobs 30–60m, X/LI 45–90m jitter
- **Auth**: Cloudflare Zero Trust owner-only wall, reject before UI/SSE render
- **Compliance**: Discord Gateway only, burner-cookie X/LI with human pacing
- **Prize**: Online events need verified liquid cash ≥₹1,00,000 (credits/vouchers stripped); swag must ship India/global

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Discord   │◄────►│   Bot Process    │◄────►│  PocketBase     │
│   Gateway   │      │ (gateway + relay │      │  (hot store)    │
│             │      │  + reminders)    │      │                 │
└─────────────┘      └──────────────────┘      └─────────────────┘
                                         │
                                         ▼
                              ┌──────────────────┐
                              │  Scheduler       │
                              │  (polling +      │
                              │   audit drain +  │
                              │   GC + timers)   │
                              └──────────────────┘
                                         │
                                         ▼
                              ┌──────────────────┐
                              │  Turso           │
                              │  (cold ledger)   │
                              └──────────────────┘
                                         │
                                         ▼
                              ┌──────────────────┐
                              │  Dashboard       │
                              │  (SSE + boards)  │
                              └──────────────────┘
```

### Process Ownership

| Process | Responsibilities |
|---------|-----------------|
| **Bot** | Discord gateway, audited-row router, relay, reminders, delivery jobs |
| **Scheduler** | Polling, audit drain, GC, headless bucket timers |
| **Dashboard** | SSE telemetry hub, audit boards, ops alerts |

## Technology Stack

- Node.js 22 LTS (Iron) + TypeScript ~5.9 + pnpm workspaces 10.x
- discord.js v14 — Discord Gateway bot
- PocketBase v0.35.x — hot DB (opportunities, agent_telemetry)
- Turso via `@libsql/client` — cold ledger (tombstones, taste rules)
- Playwright Chromium (headless shell) — shared browser for JS-heavy portals
- kelektiv/node-cron v4 — poll schedulers with noOverlap + jitter
- zod v4 — runtime validation
- pino — structured logging

## Monorepo Layout

```
apps/
  bot/             Discord bot (gateway + router + relay + reminders)
  dashboard/       Dashboard static UI
  dashboard-server/ SSE hub + REST API + GC + ops alerts
  scheduler/       Poll + audit + GC scheduler
packages/
  config/          Env schema (zod) + parse
  db-hot/          PocketBase client + schemas + telemetry
  db-cold/         Turso client + tombstone + taste rules
  dedup/           Fingerprinting + merger
  discord-router/  Portal scrapers + gateway + bookmark + taste ingest
  llm/             LlmRouter + adapters (Groq, SambaNova, Mistral, Z.ai, NVIDIA, OpenRouter)
  logger/          pino wrapper
  orchestrator/    Audit pipeline (rule pack → router → gates → write/tombstone)
  sanitize/        HTML → markdown sanitization
  scheduler-registry/ Cron job registry
infra/
  oracle/          rebuild.sh + drills
  cloudflared/     bot systemd unit
scripts/
  dev-local.mjs    One-command local stack
  verify-local.mjs Full verification gates
```

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10
- PocketBase 0.40.x (on PATH)
- `.env` file (copy from `.env.example` and fill in credentials)

### Install

```bash
pnpm install
```

### Cold ledger schema (Turso, once per database)

```bash
# requires TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (env or .env)
pnpm db:cold:apply
```

The script is idempotent (`CREATE ... IF NOT EXISTS`) and is the same path
`infra/oracle/rebuild.sh` uses on the VM.

### Build

```bash
pnpm build
```

### Test

```bash
# Root test suite (all packages)
pnpm test

# Dashboard-server tests
pnpm --filter @zod/dashboard-server test
```

### Local Development Stack

```bash
# Start PocketBase, dashboard, proxy, scheduler, and bot
pnpm dev:local

# Options:
#   --no-seed    skip dev seed
#   --no-scheduler  don't start scheduler
#   --no-bot     don't start Discord bot
```

The stack runs on:
- PocketBase: http://127.0.0.1:8090
- Dashboard: http://127.0.0.1:3000
- Dashboard proxy: http://127.0.0.1:8080

The proxy serves a multi-page, read-only dashboard — one concern per page,
shared sidebar/header, no build step:

| Route | Page |
|-------|------|
| `/` | Overview (stage stats + pipeline kanban, live stream) |
| `/flow` | Pipeline Flow (candidate kanban) |
| `/glass` | Machine Glass (every tool call + per-candidate trace drawer) |
| `/pools` | Pool Health (provider × model buckets) |
| `/boards` | Boards (8 tabs of admitted opportunities) |
| `/audit` | Audit & Rejection (verdicts, tombstones) |
| `/sources` | Sources (adapter health) |
| `/system` | System (runtime, GC, scheduler jobs) |

`/glass` is backed by the append-only `machine_events` collection: one row per
scheduler tick, dedup verdict, fetch, sanitize, LLM attempt, 429 baton-pass,
orchestrator verdict, tombstone, Discord post, and GC run. It is never seeded —
the feed only ever shows real pipeline activity. See
[docs/local-dev.md](docs/local-dev.md).

### Verification

```bash
# Full verification: build, tests, drills, rebuild dry-run
pnpm verify:local

# With browser soak (5 minutes)
pnpm verify:local --soak
```

## Pipelines

| Pipeline | Source | Cadence | Channel |
|----------|--------|---------|---------|
| events | CLIST, CTFtime, Devfolio, Devpost, Luma, Meetup, Unstop | 15–30m | #🔥-priority-sys-cp-sec / #-online-1lakh-plus |
| jobs | Greenhouse, Ashby, etc. | 30–60m | #💼-jobs-sys-cloud / #💼-jobs-general |
| local | DK/Udupi domains | 2–4h | #📍-local-dk-udupi |
| social | X/LinkedIn (burner cookies) | 45–90m jitter | #⏳-early-tba-radar / #-online-1lakh-plus |
| loot | Perk-carrying events | N/A (divert) | #🎁-loot |

## GC (MEM-05)

Midnight garbage collector:
- Deletes `agent_telemetry` rows older than 24h
- Clears `opportunities.description_raw` 24h after `end_date` or 48h after rejection
- Never touches `tombstone_ledger` or `taste_rules`
- Persists last-success marker in `agent_telemetry` slot `gc-last-success`
- Raises 25h-missing alert to #🛠-ops-health via Discord REST

## LLM Ladder

Tier 1 (free): Groq → SambaNova (paid opt-in)
Tier 2 (overflow, key-gated): Mistral, Z.ai, NVIDIA NIM, OpenRouter :free

Tier-2 adapters are constructed only when their provider API key is configured. Missing keys mean those buckets are skipped entirely — never attempted.

## License

MIT