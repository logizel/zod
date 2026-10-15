# Stack Research

**Domain:** Autonomous opportunity-intelligence swarm (Discord bot + realtime dashboard, Oracle Always-Free ARM)
**Researched:** 2026-10-15
**Confidence:** HIGH (Context7-verified library docs; MEDIUM on exact free-tier model IDs which rotate)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js LTS | `22.x` (Iron) | Bot + scrapers + scheduler runtime | Current LTS on ARM64 with native `fetch`, `EventSource`-adjacent streaming, and full `playwright`/`discord.js` support. Node 22 is the floor for `discord.js` v14 voice/Undici paths; do NOT pin Node 18/20 — EOL pressure and slower Undici. Confidence: HIGH |
| TypeScript | `~5.9` | Single language across bot, scrapers, dashboard | Strict-mode TS + `zod` inference kills an entire class of scraper-shape bugs (ATS JSON varies per portal). One toolchain for ARM VM, no Python sidecar to babysit. Confidence: HIGH |
| pnpm workspaces | `10.x` | TS monorepo package manager | Fastest installs on a thin ARM VM, content-addressable store saves disk (200GB boot volume is generous but keep it lean), strict `node_modules` isolation catches phantom imports across `apps/*` / `packages/*`. npm workspaces is the fallback; avoid yarn v1 (dead) and bun-as-runtime (Playwright + discord.js voice edge cases). Confidence: HIGH |
| discord.js | `^14.25.1` (v14 line) | Discord Gateway bot (alerts, reactions, relay) | The standard: `GatewayIntentBits` + `Partials` + `EmbedBuilder` cover all 10 routing channels, bookmark reactions, and `#announcements` gateway relay. v14 is the stable documented line (Context7: `/websites/discord_js_packages_discord_js_14_25_1`, High reputation, 12k snippets). Do NOT use discord.js v13 (pre-`EmbedBuilder`, different intent enums) or raw `discord-api-types` + raw WebSocket (reinventing sharding/reconnect). Confidence: HIGH |
| PocketBase (+ `pocketbase` JS SDK) | Server `v0.35.x` self-hosted single binary; SDK `^0.30` | Hot DB: opportunities + agent_telemetry, native SSE realtime | Single Go binary with embedded SQLite-WAL, admin UI, auth, and **native realtime subscriptions** — exactly the "rolling agent slots + opportunity boards over SSE" requirement with zero extra infra. Node SDK needs the `eventsource` polyfill (`npm i eventsource`, assign `global.EventSource`) — verified in Context7 js-sdk README. Self-host on the Oracle VM (data dir on block volume) so hot ops are localhost-latency. Confidence: HIGH |
| Turso via `@libsql/client` | `@libsql/client ^0.15` (remote-only mode) | Cold ledger: tombstone_ledger + taste_rules surviving VM rebuild | Turso is SQLite-over-the-wire; `@libsql/client.createClient({url, authToken})` is the documented remote path (Context7 `/tursodatabase/turso-docs`). No local replica/sync on the bot VM — cold writes are rare (GC purges, dedup fingerprints, taste updates) so plain remote calls keep the failure surface minimal. Do NOT pull `@tursodatabase/sync` embedded-replica machinery unless cold reads become hot-path. Confidence: HIGH |
| Cloudflare Tunnel (`cloudflared`) + Pages + Zero Trust Access | `cloudflared` latest 2026.x (auto-update); Pages for dashboard static | Zero-inbound-port exposure; owner-only dashboard wall | `cloudflared tunnel` from the VM → Cloudflare edge means the Oracle firewall stays fully closed (no open 80/443/8090). Pages hosts the read-only dashboard (static + SSE client); Zero Trust Access policy gates *both* the page and the SSE endpoint before any UI renders — zero app-auth code to write or bypass. Alternative Tailscale is fine for admin SSH but Cloudflare is the prescribed public path because Access covers browser + `EventSource` uniformly. Confidence: HIGH |
| Playwright Chromium (`playwright-core` + system chromium) | `^1.55–1.63` line (Context7 shows up to v1.63.0); `playwright-core` + `--only-shell` / `channel: 'chromium'` | Single shared headless browser for JS-heavy portals and bio-link hops | One `chromium.launch()` shared across the scheduler, max 2–3 queued tabs, `context.route('**/*.{png,jpg,jpeg,woff2,mp4}') → abort()` (verified Context7 pattern) + media-off launch args. Install with `--only-shell`/`headless shell` to keep the ARM image small; full `playwright` package only if headed debugging is needed (never on the VM). Confidence: HIGH |
| Crawl4AI *or* Jina Reader + `cheerio` sanitize | `cheerio ^1.1`, `turndown ^7.2` (markdown), Jina Reader HTTP API | HTML → clean markdown, script/style/SVG/nav strip (85–90% token cut) | Prescription: **default to Jina Reader (`https://r.jina.ai/<url>`) for plain pages** (zero browser/RAM cost) and reserve the shared Playwright tab for JS-gated pages only; run all markdown through `cheerio` strip + length-cap before any LLM call (this is what makes 413s rare by construction). Crawl4AI (Python service) is the self-hosted fallback if Jina free tier throttles — do NOT run both; pick Jina first, add Crawl4AI only on evidence of throttling. Confidence: MEDIUM (Jina free-tier limits shift; the sanitize pipeline itself is HIGH) |
| LLM ladder SDKs: `groq-sdk` + `@cerebras/cerebras_cloud_sdk` + `openai` (GitHub Models + SambaNova compat) | `groq-sdk` latest; `@cerebras/cerebras_cloud_sdk` latest; `openai ^4/5` as compat client | Tiered free inference: Groq → Cerebras → GitHub Models → SambaNova → Mistral/Z.ai/NVIDIA/Cohere/OpenRouter overflow | All four primaries are OpenAI-chat-completions-shaped; use each vendor's first-party SDK for Tier 1 (verified Context7: `groq-sdk` exposes `Groq.RateLimitError` + `Retry-After` headers — build the baton-pass on that) and the `openai` client with `baseURL` override for GitHub Models (`https://models.github.ai/inference`), SambaNova (`https://api.sambanova.ai/v1`), OpenRouter (`:free` suffix models). One `LlmRouter` interface, per-model 2D bucket counters, 429→next-bucket + `Retry-After` backoff, 413→length-stitch/summarize-and-retry. Confidence: HIGH on SDK shapes; MEDIUM on exact model IDs (rotate quarterly — pin in config, not code) |
| `kelektiv/node-cron` (NOT `node-cron`) | `kelektiv/node-cron ^4` | Poll schedulers (events 15–30m, jobs 30–60m, local 2–4h, X/LI 45–90m) | The maintained cron fork (Context7: High reputation, benchmark 89.5) with `noOverlap: true` (verified — skips a tick while the previous run is pending, critical for 2.5GB-RAM ARM under scrape pileups), `timezone`, and `maxRandomDelay`/jitter support. The original `node-cron` package is effectively unmaintained — using it is the #1 scheduler pitfall. One process, one scheduler module owning all jobs; do NOT scatter `setInterval` across files. Confidence: HIGH |
| `zod` | `^4` (v4 line; Context7 shows up to v4.6.5) | Runtime validation of every external shape (ATS JSON, RSS, PB rows, LLM JSON) | TS-first inference: define once, get types free. Every portal adapter returns `Schema.parse()`'d objects so a Greenhouse schema drift fails loudly at the edge instead of poisoning dedup/fuzzy-match downstream. v4 is current; v3 (`^3.24`) acceptable if a dep conflicts. Confidence: HIGH |
| `pino` | `^10` | Structured JSON logging (agent_telemetry mirror) | Fastest Node logger (Context7 v10.1.0), child loggers per pipeline (`scout/events`, `auditor/jobs`), log levels map 1:1 to `agent_telemetry` rows. `pino-pretty` only in dev; raw JSON on VM (journald-friendly). Avoid winston (slower, heavier config). Confidence: HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `eventsource` | `^3` | `EventSource` polyfill for PB realtime in Node | Always (server-side) — PB js-sdk realtime requires `global.EventSource = EventSource`. Browser dashboard needs nothing. Confidence: HIGH |
| `rss-parser` | `^3.13` | RSS/Atom first-pass ingestion | Always for RSS-capable sources (CLIST.by, CTFtime, many ATS blogs) — RSS-before-headless is a cost rule, not an optimization. |
| `turndown` | `^7.2` | HTML→Markdown after cheerio strip | Always in the sanitize pipeline (Jina output is already markdown; Playwright/cheerio output needs it). |
| `string-similarity` / `fast-levenshtein` | latest | Fuzzy duplicate merger scoring | In the dedup step (event title + date + organizer fuzzy keys). |
| `date-fns` (+ `date-fns-tz`) | `^4` | Deadline parsing, TBA 48h re-ping math, IST display | Anywhere dates cross system boundaries (scraper → PB → Discord `<t:...>` timestamps). |
| `dotenv` + `t3-env`-style validation | `dotenv ^16`, validate with `zod` | Secrets (bot token, Turso token, LLM keys) | Always; fail boot on missing required env (`env.parse()` at entrypoint). |
| `undici` fetch (built-in) | Node 22 built-in | Cookie-session X/LinkedIn polling + search-index fallback | Prefer built-in `fetch` with persistent cookie jar (`fetch-cookie` wrapper) over axios/got — fewer deps, native on 22. |
| `vitest` | `^3` | Unit tests (parsers, routing rules, dedup, 429/413 router) | From phase 1 for pure functions; Playwright-the-library is NOT the test runner here (runner = vitest, browser = shared chromium lib). |
| `tsx` | `^4` | Dev runner + production entry (`tsx` or compiled `tsc`) | Dev `tsx watch`; production either `tsc` build or `tsx` direct — decide once in phase 0 (recommend `tsc` emit for the 24/7 process so startup has no JIT-transpile tax). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `cloudflared` (systemd service) | Tunnel Pages/Access → localhost PB + dashboard API | Run as systemd unit with `restart=always`; tunnel token in env, never in repo. Pin via apt repo `cloudflare-main`; auto-update on. |
| PocketBase binary (ARM64) | Hot DB server | Download `pocketbase_*_linux_arm64.zip` for the Ampere VM (NOT amd64). Data dir + `pb_data` on the block volume; nightly `sqlite3 .backup` to object storage. Serve behind `localhost:8090` only — never bind `0.0.0.0` (tunnel is the only ingress). |
| `r.jina.ai` key (free) + `JINA_API_KEY` | Reader API tier | Free tier suffices at this poll cadence; key raises rate limits vs keyless. |
| GitHub PAT (classic, `models:read` scope) | GitHub Models inference auth | `GITHUB_TOKEN` with models permission; `openai` client pointed at `https://models.github.ai/inference`. |
| Oracle Cloud ARM VM + 2.5GB cache-buffer sidecar | Always-Free Ampere host | Hold 22–30% RAM: a tiny wired-cache process (or `systemd-run` tmpfs reservation) so the idle-reclaim detector never sees a flatlined VM. All stateful data on attached block volume so rebuild = reattach + reboot. |

## Monorepo Layout (prescribed)

```
zod/
├── apps/
│   ├── bot/            # discord.js gateway: commands, 10-channel router, audit cards, reactions
│   ├── dashboard/      # Cloudflare Pages static: SSE client, pool-health grid, boards (read-only)
│   └── scheduler/      # kelektiv/node-cron entrypoint: owns ALL jobs, imports pipelines
├── packages/
│   ├── pipelines/      # Scout → Link-Hopper → Deep-Auditor → Chief Curator + Task_Scratchpad
│   ├── scrapers/       # Portal adapters (Unstop, Devfolio, Greenhouse, Lever…) — RSS/API first
│   ├── browser/        # SINGLETON shared Playwright instance, tab queue (max 2–3), route-abort
│   ├── sanitize/       # cheerio strip → turndown → length-cap (Jina/Crawl4AI clients here)
│   ├── llm/            # LlmRouter: 2D bucket rotation, 429/413 baton-pass, length-stitch
│   ├── rules/          # Event/job/loot rule packs (Sys-CP-Sec fast-track, 80/20, geo/prize buckets)
│   ├── dedup/          # Fingerprints, fuzzy merger, tombstone checks (hot PB + cold Turso)
│   ├── db-hot/         # PocketBase client, collection schemas, SSE subscriptions
│   ├── db-cold/        # @libsql/client, tombstone_ledger + taste_rules access
│   ├── discord/        # Embed builders, channel map, relay handler (shared by bot)
│   └── config/         # zod-validated env, model ladder config, poll cadences, jitter ranges
├── infra/
│   ├── cloudflared/    # tunnel config.yml, systemd unit
│   ├── pocketbase/     # backup script, collection migration notes
│   └── oracle/         # firewall/ingress notes (everything closed), setup runbook
└── package.json        # pnpm-workspace root
```

**Why this shape:** `apps/*` are deployables (3 processes max on the VM: bot, scheduler, pocketbase binary; dashboard is off-VM on Pages), `packages/*` are import-only libraries with zero cross-imports except downward into `config`/`db-*`. The `browser` singleton and `llm` router are the two shared-resource bottlenecks — isolating them as packages forces all contention (tab queue, 429 buckets) through one code path instead of N ad-hoc copies.

## Installation

```bash
# Node 22 ARM + pnpm 10 (VM bootstrap, once)
node -v  # v22.x
corepack enable && corepack prepare pnpm@10 --activate

# Root workspace
pnpm init && pnpm add -D typescript@~5.9 tsx@^4 vitest@^3

# Bot
pnpm --filter @zod/bot add discord.js@^14 eventsource

# Scheduler + pipelines
pnpm --filter @zod/scheduler add kelektiv/node-cron
pnpm --filter @zod/pipelines add groq-sdk @cerebras/cerebras_cloud_sdk openai

# Shared packages
pnpm --filter @zod/db-hot add pocketbase eventsource
pnpm --filter @zod/db-cold add @libsql/client
pnpm --filter @zod/browser add playwright-core
pnpm --filter @zod/sanitize add cheerio turndown
pnpm --filter @zod/shared add zod pino rss-parser date-fns dotenv fast-levenshtein

# Playwright headless-shell only (small ARM footprint)
pnpm exec playwright-core install --only-shell chromium
# NOTE: package is `playwright-core`; binary invoked via `playwright-core install`
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| discord.js v14 | `discord.py` / raw REST | Never for this project (TS monorepo decision); raw REST only for one-off webhook posts, never the gateway bot |
| PocketBase hot | Supabase / Firebase / Mongo | If you outgrow single-node SQLite (10k+ concurrent dashboard viewers) — not v1; Supabase pauses on free tier which kills 24/7 |
| Turso cold | Cloudflare D1 / Neon / PlanetScale | D1 if you move the dashboard compute to Workers AND accept D1's smaller free tier; Turso wins on 5GB + 500M reads + plain SQLite semantics |
| Jina Reader default | Crawl4AI self-hosted / Firecrawl cloud | Crawl4AI when Jina throttles persistently (self-hosted Docker on the same VM); Firecrawl never (paid, violates zero-cost) |
| kelektiv/node-cron | BullMQ + Redis / system cron | BullMQ if jobs need durable queues across restarts AND you accept running Redis on the VM; system cron if the scheduler ever splits into OS-level jobs (loses jitter/noOverlap ergonomics) |
| pnpm workspaces | npm workspaces / Turborepo / Nx | npm workspaces if pnpm's strictness fights a dep (rare); Turborepo/Nx only when build-graph caching matters (3 apps — it doesn't yet) |
| `openai`-compat clients | Per-vendor SDK for every provider | Only for Tier-1 Groq/Cerebras (first-party error types pay off); compat client for the long tail |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `node-cron` (original, `merencia` scope lineage) | Unmaintained; lacks `noOverlap`/jitter hardening the scheduler depends on | `kelektiv/node-cron` |
| discord.js v13 or `discord.io`/`eris` (stale forks) | Wrong intent/partials/embed APIs; v13 partials+threads model differs — all tutorial code will mismatch | `discord.js@^14` |
| Self-bot / user-token scraping for Discord relay | Against ToS, token-ban risk kills the whole alert surface | Bot Gateway `GuildMessages` intent relay into `#raw-incoming-feeds` |
| Supabase free tier as hot DB | Pauses after inactivity; 24/7 poller + realtime breaks on wake | PocketBase self-hosted (always on, same VM) |
| Full `playwright` package + headed browsers on VM | ~2x disk, needs X deps on ARM; violates the 1-shared-instance budget | `playwright-core` + `--only-shell` chromium |
| One browser per scrape / `browser.launch()` in adapters | RAM death on 2.5GB-buffer ARM box; orphaned Chromium processes are the #1 idle-reclaim-adjacent killer | `packages/browser` singleton + tab queue |
| Raw HTML fed to LLMs | 85–90% token waste → 413s + free-tier burn | cheerio strip + turndown + length-cap before every LLM call |
| `axios` / `got` / `request` | Redundant deps; Node 22 native `fetch` + `fetch-cookie` covers session-cookie polling | Built-in `fetch` |
| `winston` | Heavier + slower than pino; config-heavy for a telemetry-mirrored logger | `pino` |
| Mongoose/Prisma for PocketBase or Turso | Both are SQLite-wire; an ORM adds schema-drift surface with zero benefit at this query complexity | Raw `pb.collection()` + `libsql` prepared statements, `zod`-validated |
| Bun as production runtime | Playwright + discord.js voice/native edges + ARM quirks; immature systemd story | Node 22 LTS (bun acceptable as a package-manager experiment only, never prod) |
| Cloudflare D1 as cold ledger (default) | Smaller free tier than Turso for this read pattern; PROJECT.md already decided Turso | `@libsql/client` → Turso |

## Stack Patterns by Variant

**If Jina Reader starts 402/429ing persistently:**
- Deploy Crawl4AI Docker on the VM, point `packages/sanitize` fetcher at `localhost:11235`, keep the same cheerio/turndown post-pipeline
- Because the sanitize contract (URL in → capped markdown out) is unchanged; only the fetcher swaps

**If a free LLM vendor kills its tier (happens ~yearly):**
- Remove its entry from `packages/config` ladder, overflow absorbs the load — no code change
- Because all vendors sit behind the `LlmRouter` interface with per-bucket counters, not inline SDK calls

**If PocketBase outgrows single-node (dashboard viewers spike):**
- Keep PB as write-master + hot store; add read-replica via Litestream to object storage, dashboard reads replica
- Because PB is SQLite-WAL under the hood — Litestream replication is a 10-line addition, not a migration

**If Oracle reclaims the VM despite the RAM buffer:**
- Reattach block volume on a fresh Ampere instance, restore `pb_data` backup, re-run infra runbook (all state is on the volume + Turso cold)
- Because compute is cattle (tunnel + systemd re-register) and state lives off-instance

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `discord.js@14.25.x` | Node `>=22`, `discord-api-types@^0.37` (peer) | v14 requires gateway v10; `GuildMessages`, `MessageContent` (privileged — enable in dev portal), `GuildMessageReactions` intents + `Partials.Message/Reaction/Channel` for bookmark reactions on uncached messages |
| `pocketbase` JS SDK `^0.30` | PB server `v0.29+` (use `v0.35.x`) | SSE realtime needs `eventsource` polyfill in Node; SDK auth store `AsyncAuthStore` for multi-process (bot + scheduler share one service account) |
| `@libsql/client ^0.15` | Node `>=18`, Turso cloud | Remote-only `createClient({url: process.env.TURSO_DATABASE_URL, authToken})`; do NOT mix `file:` + `syncUrl` unless adopting embedded replicas deliberately |
| `playwright-core ^1.55+` | Headless-shell chromium on linux-arm64 | `install --only-shell chromium`; `launch({ channel: 'chromium' })` for full chromium only when shell lacks a codec a portal needs |
| `groq-sdk` / `@cerebras/cerebras_cloud_sdk` | Node `>=18`, OpenAI-shape chat API | Catch `Groq.RateLimitError` (429) reading `Retry-After`; treat HTTP 413 as length-violation → shrink + stitch, never blind-retry |
| `kelektiv/node-cron ^4` | Node `>=18` | `schedule(expr, fn, { timezone: 'Asia/Kolkata', noOverlap: true, maxRandomDelay: ms })` — jitter per job, not global |
| `zod ^4` | TS `>=5.5` | Prefer `z.infer<>` types everywhere; `zod/v4` import path for the new API (`@zod/core` only if tree-shaking the browser bundle — not needed, dashboard is static) |
| `pino ^10` | Node `>=20` | `pino({ level: process.env.LOG_LEVEL ?? 'info' })` + per-package child loggers; no worker-thread transports on ARM (sync file or stdout only) |

## Sources

- Context7 `/websites/discord_js_packages_discord_js_14_25_1` (High, 12k snippets) — v14 API surface, intents/embeds — HIGH
- Context7 `/pocketbase/js-sdk` (official README) — SDK install, EventSource polyfill, auth + realtime — HIGH
- Context7 `/pocketbase/pocketbase` (versions incl. v0.35.0) + `/websites/pocketbase_io` — server capabilities — HIGH
- Context7 `/tursodatabase/turso-docs` (High, 4.3k snippets) — `@libsql/client` remote + sync patterns — HIGH
- Context7 `/microsoft/playwright` (High, 8.9k snippets; versions to v1.63.0) — shared-instance launch, `context.route` abort pattern — HIGH
- Context7 `/groq/groq-typescript` — `RateLimitError` + `Retry-After` + backoff batch pattern — HIGH
- Context7 `/cerebras/cerebras-cloud-sdk-node` (resolved, High) — Cerebras Node SDK shape — MEDIUM (docs not deep-fetched; API is OpenAI-compatible so risk is low)
- Context7 `/node-cron/node-cron` + `/kelektiv/node-cron` (High, benchmark ~90) — `noOverlap`, jitter/`maxRandomDelay`, scheduler semantics — HIGH
- Context7 `/colinhacks/zod` (versions to v4.6.5) — v4 line currency — HIGH
- Context7 `/pinojs/pino` (versions v8/v10) — v10 currency — HIGH
- PROJECT.md constraints (Oracle ARM, zero-cost, 2–3 tabs, poll cadences) — HIGH (project-authoritative, not independently verified against vendor free-tier pages; re-verify Groq/Cerebras/GitHub-Models/SambaNova + Jina + Turso limits at build time)

---
*Stack research for: Autonomous opportunity-intelligence swarm (Discord bot + realtime dashboard)*
*Researched: 2026-10-15*
