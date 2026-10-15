# Phase 01: Foundation - Research

**Researched:** 2026-10-15
**Domain:** Greenfield TS monorepo scaffold + PocketBase hot / Turso cold memory + Cloudflare Tunnel/Zero Trust shell + single-flight scheduler skeleton on Oracle ARM
**Confidence:** HIGH (package APIs verified via Context7 + npm registry this session; MEDIUM on Cloudflare edge behavior via docs fetch; LOW/ASSUMED on Oracle VM specifics)

## Summary

Phase 1 builds the surviving home for everything downstream: a pnpm-workspace TypeScript monorepo (`apps/bot,scheduler,dashboard` + `packages/*`), live PocketBase + Turso schemas with a fingerprint/dedup contract, a supervised `cloudflared` tunnel fronting a static Zero-Trust-locked dashboard shell, and a `node-cron` scheduler skeleton with overlap prevention and jitter. No pipelines, no LLM calls, no browser work — only the contracts those layers will depend on.

Research corrected four version/specifier errors in the prior stack guidance that would have broken the build on day one: (1) the scheduler must be installed as `node-cron@^4.6.0` from the npm registry — the `kelektiv/node-cron` GitHub shorthand points at a *different* package family (`cron`'s `CronJob` API) and git-fetch installs are blocked/refused in locked-down environments; (2) `pocketbase` JS SDK `^0.30` does not exist (npm latest is `0.28.1`) — pin `^0.28.0`; (3) `@libsql/client ^0.15` excludes the current `0.18.0` (0.x caret ranges do not span minors) — pin `^0.18.0`; (4) PocketBase server has moved to `v0.40.5` (with a Go `net/http` DoS security fix) while the locked decision pins `v0.35.x` — flagged as an open question, not overridden.

**Primary recommendation:** Scaffold with `node-cron@4.6.0`, `pocketbase@0.28.1`, `@libsql/client@0.18.0`, `zod@4.6.7`, `pino@10.4.0`, `vitest@3.2.7`, `dotenv@16.6.1`, `eventsource@5.1.3`, `typescript@5.9.3`, `tsx@4.23.15` under pnpm 10 + Node 22, prove each success criterion with an automated drill (VM-wipe restore, unauth edge-reject, forced-overlap skip, port scan, git-history secret scan), and keep every Phase 1 proof runnable as a script — not a manual checklist.

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Monorepo scaffold shape
- **D-01:** Create full layout now — `apps/bot,scheduler,dashboard` + `packages/*` skeleton per research contract, to avoid re-scaffolding later — **Reversibility:** costly — renaming/moving packages touches all imports
- **D-02:** Pin Node 22.x + pnpm 10.x workspaces with strict isolation
- **D-03:** Production entry via compiled `tsc` emit (no JIT-transpile tax for 24/7 process); `tsx` dev-only
- **D-04:** Phase 1 packages are core-only: `config`, logger, env-validation, memory clients, scheduler skeleton. Browser/sanitize/LLM/discord-router packages arrive with Phase 2/3/4
- **D-05:** vitest 3 setup from day one for pure functions (parsers, fingerprint, routing helpers)
- **D-06:** Strict env gate — `dotenv` + `zod` `env.parse()` at entrypoint, fail boot on missing secrets; pino redacting logger; pre-commit secret scan; no secrets in git history
- **D-07:** Strict TypeScript + `zod` v4 at every external boundary (`z.infer` types everywhere; v3 fallback only on proven dep conflict)
- **D-08:** `pino` v10 JSON to stdout (journald-friendly) + per-pipeline child loggers; `pino-pretty` dev only

#### Hot/cold memory depth
- **D-09:** Ship full schemas now — `opportunities`, `agent_telemetry`, `task_scratchpad`, `tombstone_ledger`, `taste_rules` with indexes — even though writers land later — **Reversibility:** one-way — schema change after data exists needs migration
- **D-10:** PocketBase ARM64 binary, bind `localhost:8090` only (never `0.0.0.0`), `pb_data` on block volume, nightly `sqlite3 .backup` to object storage — **Reversibility:** costly — data-dir move needs volume + backup path migration
- **D-11:** Turso remote-only via `@libsql/client` `createClient({url, authToken})`; `tombstone_ledger` `url_hash` PK never deleted; `taste_rules` seeded empty; no embedded replica/sync in v1
- **D-12:** Implement fingerprint fn + two-tier pre-scrape check in Phase 1 (normalize URL + title/date/organizer hash; hot PB check then Turso point-lookup; target <5ms)
- **D-13:** Realtime-ready now — `eventsource` polyfill + shared service account via `AsyncAuthStore` so bot + scheduler share auth; live SSE boards themselves stay Phase 7
- **D-14:** Pin versions per STACK.md — PB server `v0.35.x` + JS SDK `^0.30`, `@libsql/client ^0.15`
- **D-15:** GC-ready fields now — `end_date`, `status`, heavy-text columns + indexes so Phase 7 midnight GC has columns to purge; tombstones + taste rules retained
- **D-16:** Prove criterion 2 with automated simulated VM-wipe drill — restore PB backup + replay Turso cold ledger, assert opportunities + telemetry survive

#### Tunnel + dashboard shell
- **D-17:** Phase 1 "locked shell" = static placeholder behind Zero Trust owner-only + supervised `cloudflared` systemd + Cloudflare Pages deploy now — proves criterion 3 without building boards — **Reversibility:** costly — URL + Access policy + tunnel route are depended on by Phase 7
- **D-18:** Zero open inbound firewall ports; `cloudflared` tunnel is the only ingress; verify with port scan; `localhost:8090` never exposed
- **D-19:** `cloudflared` supervised via systemd `restart=always`, token in env never in repo, dual-heartbeat monitoring (tunnel + scheduler pings) with alerts
- **D-20:** Automated Zero Trust edge-reject test — unauthenticated request to UI and SSE endpoint rejected before render
- **D-21:** Install `cloudflared` via apt `cloudflare-main` repo, auto-update on, version logged in runbook
- **D-22:** Shell is static only in Phase 1; PB SSE passthrough + slots/health-grid/boards are Phase 7

#### Scheduler + reclaim defense
- **D-23:** Scheduler = framework + one stub job per cadence (events 15–30m, jobs 30–60m, local 2–4h, social 45–90m jitter) with duration metrics; single scheduler module owns all jobs; real poll logic arrives with Phase 2+
- **D-24:** `kelektiv/node-cron` (never `node-cron`) with `noOverlap: true` + `maxRandomDelay` jitter per job, `timezone: 'Asia/Kolkata'`
- **D-25:** Reclaim defense = tiny wired-cache process holding 2.5GB to keep 22–30% RAM + external watchdog alerting on silence — **Reversibility:** costly — removing buffer changes idle-reclaim risk profile
- **D-26:** One documented rebuild command restores VM + `pb_data` from block-volume backup + reapplies Turso schemas — tested end-to-end (criterion 1)
- **D-27:** Prove no-overlap with forced-overlap test — second tick skips while first pending; duration metrics to telemetry
- **D-28:** Secrets hygiene = pre-commit scan + redacting logger + env-only tokens; scan git history in Phase 1 drill

### Agent's Discretion
No "you decide" selections — user chose concrete options for all 28 decisions. Researcher/planner have flexibility on: watchdog provider choice, backup object-storage target, stub-job naming, heartbeat interval values, and exact index sets — as long as success criteria and locked decisions above hold.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope creep raised; no todos folded (todo match count 0).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEM-01 | Hot PocketBase `opportunities` collection stores fingerprint_hash, pipeline, bucket_channel, status, prize, links, deadlines, reminders, bookmark, audit_summary | PB server v0.35.0 ARM64 asset verified; SDK `^0.28.0` + `AsyncAuthStore` + `global.EventSource` patterns verified; full 5-collection schema + GC-ready fields prescribed below |
| MEM-02 | Hot `agent_telemetry` ring streams slot/provider/model/step/url/status over SSE with 24h retention | PB realtime `subscribe()` is the native SSE source; ring = capped collection + purge-by-age (GC lands Phase 7, columns/indexes land now per D-15) |
| MEM-03 | Cold Turso `tombstone_ledger` (url_hash PK, fingerprint, terminal status) checked pre-scrape in <5ms, never deleted | `@libsql/client@^0.18.0` `createClient({url, authToken})` remote-only verified; hash-PK point-lookup DDL + `batch()` patterns below; <5ms = localhost PB + single-row remote lookup, measured in drill |
| OPS-01 | Oracle VM holds 22–30% baseline RAM via 2.5GB cache buffer; single shared browser capped at 2–3 tabs, media off | Buffer + watchdog + rebuild runbook prescribed; browser cap is a Phase 2 package — Phase 1 only reserves the constraint (no browser code per D-04) |

## Project Constraints (from AGENTS.md)

Greenfield repo (no `src/`, `apps/`, `packages/` yet) — AGENTS.md stack section is authoritative until code exists. Actionable directives the planner must honor:
- Node 22.x (Iron) + pnpm 10.x workspaces; TypeScript `~5.9` strict; `tsc` emit for production, `tsx` dev-only
- PocketBase hot (ARM64, `localhost:8090` only, `pb_data` on block volume) + Turso cold (remote-only `@libsql/client`); never expose PB publicly
- `cloudflared` tunnel is the only ingress; Zero Trust Access owner-only gates UI *and* SSE before render
- Single scheduler module owns all jobs; `zod` v4 validation at every external boundary; `pino` v10 JSON logging with child loggers
- Browser/sanitize/LLM/discord packages are Phase 2+ — Phase 1 creates core-only packages (`config`, logger, env, memory clients, scheduler skeleton)

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Monorepo scaffold + scheduler process | Oracle VM (API/Backend tier — Node 22) | — | Single Node process owns all cron jobs; no other runtime exists in v1 |
| Hot memory (PB server + SDK clients) | Oracle VM (Database tier, localhost-only) | — | SQLite-WAL single binary; hot ops must be localhost-latency; never publicly bound |
| Cold ledger (Turso) | External SaaS (Database tier, off-VM) | — | Survival across VM reclaim depends on state living outside the VM |
| Tunnel ingress (`cloudflared`) | Oracle VM (Egress agent, outbound-only) | Cloudflare edge | Outbound QUIC (port 7844) from VM → edge; Oracle firewall keeps zero inbound ports |
| Owner-only gate (Access policy) | Cloudflare edge (Zero Trust) | — | Reject-before-render must happen at the edge, not in app code (no app-auth to write or bypass) |
| Static dashboard shell | Cloudflare Pages (CDN/Static) | — | Phase 1 shell is static only; no VM compute serves it (SSE passthrough is Phase 7) |
| Scheduler cadence + overlap guard | Oracle VM (scheduler module) | — | `noOverlap` + jitter + duration metrics are framework properties of the single scheduler module |
| Reclaim defense (RAM buffer + watchdog) | Oracle VM (OS process) + external monitor | — | Buffer holds the reclaim metric; watchdog must live off-VM to observe VM death |
| Secrets (env, pre-commit scan, redaction) | Repo + VM env (build/deploy tier) | — | Hygiene must precede the first real credential; history rewrites are the cost of lateness |

## Standard Stack

> **Version drift corrections applied this session** (all versions below confirmed via `npm view` on 2026-10-15). Where a locked decision (D-14/D-24) names a specifier that does not resolve, the correction is documented and the planner must use the resolving specifier — see Open Questions Q1/Q2.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js LTS | `22.x` (Iron) | Bot + scheduler runtime on ARM VM | Floor for discord.js v14/Undici paths; native `fetch`; current LTS on ARM64 [CITED: https://pnpm.io/workspaces + prior STACK research] |
| TypeScript | `~5.9` (latest 5.9.x: `5.9.3`) [CITED: npm registry] | Single language, strict mode | `zod` inference kills scraper-shape bugs; one toolchain. Do NOT take latest — npm `latest` is the `7.x` dev line [CITED: npm registry] |
| pnpm workspaces | `10.x` (latest 10.x: `10.34.7`) [CITED: npm registry] | Monorepo package manager | Content-addressable store (lean disk), strict isolation catches phantom imports; `workspace:` protocol forces local resolution [CITED: https://pnpm.io/workspaces]. Do NOT take latest — npm `latest` is `12.x` [CITED: npm registry] |
| `node-cron` (registry package, repo `node-cron/node-cron`) | `^4.6.0` (latest `4.6.0`, 2026-07-05; 5.0M/wk) [VERIFIED: npm registry] | All poll schedulers | v4 has exactly the locked API: `noOverlap`, `maxRandomDelay`, `timezone`, `name`, per-task `logger`, `execution:overlap` events [VERIFIED: Context7 /node-cron/node-cron + /websites/nodecron]. Install from registry — see correction §1 |
| `pocketbase` JS SDK | `^0.28.0` (latest `0.28.1`) [VERIFIED: npm registry] | Hot DB client (PB + realtime) | `AsyncAuthStore({save, clear?, initial})` for shared service-account auth; `global.EventSource = EventSource` polyfill required in Node [VERIFIED: Context7 /pocketbase/js-sdk]. `^0.30` does not exist — see correction §2 |
| PocketBase server | `v0.35.x` per lock (tag `v0.35.0` exists; `linux_arm64` asset verified) [CITED: github.com/pocketbase/pocketbase releases] | Hot DB server binary | Single Go binary, embedded SQLite-WAL, admin UI, native realtime. Latest upstream is `v0.40.5` (2026-10-08, incl. Go `net/http` DoS fix) — upgrade question open, see Q1 |
| `@libsql/client` | `^0.18.0` (latest `0.18.0`; 3.8M/wk) [VERIFIED: npm registry] | Cold ledger client (Turso remote) | `createClient({url, authToken})` remote-only is the documented path; `execute()` covers DDL + parameterized writes; `batch()` for tombstone batching [VERIFIED: Context7 /tursodatabase/turso-docs]. `^0.15` excludes 0.18 — see correction §3 |
| `cloudflared` | latest via apt `cloudflare-main`, auto-update on | Tunnel daemon (only ingress) | `tunnel create` + `config.yml` (`tunnel` UUID + `credentials-file`) + `route dns` + `service install` systemd path verified [CITED: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/local-management/create-local-tunnel/ + .../as-a-service/linux/]. Outbound QUIC 7844 — firewall pre-check needed |
| Cloudflare Pages + Zero Trust Access | dashboard shell host + owner-only gate | Static shell + edge wall | Access is deny-by-default; owner-only = `Allow` + `Include` `Emails: <owner>`; never `Include Everyone` [CITED: https://developers.cloudflare.com/cloudflare-one/policies/access/] |
| `zod` | `^4.6.7` (latest `4.6.7`; 346M/wk) [CITED: npm registry + Context7 /colinhacks/zod] | Env gate + every external boundary | `z.object().parse(process.env)` fail-fast boot; `z.infer` types everywhere; v4 has `z.email()`, `z.iso.date()` top-level APIs |
| `pino` | `^10.4.0` (latest `10.4.0`) [CITED: npm registry + Context7 /pinojs/pino] | Structured JSON logging | `redact: {paths, censor}` for secrets; `logger.child(bindings)` per pipeline; stdout raw JSON on VM, `pino-pretty` dev-only |
| `vitest` | `^3.2.7` (latest 3.x: `3.2.7`) [CITED: npm registry + Context7 /vitest-dev/vitest] | Unit tests from day one | v3 uses `test.workspace`; v5 renamed it to `test.projects` — stay on v3 per lock, use per-package configs. Do NOT take latest (`5.0.4`) [CITED: npm registry] |
| `dotenv` | `^16.6.1` (latest 16.x: `16.6.1`) [CITED: npm registry] | `.env` loading (validated by zod) | Real `.env` gitignored; `.env.example` committed. Do NOT take latest (`18.0.8`) without verification [CITED: npm registry] |
| `eventsource` | `^5.1.3` (latest `5.1.3`) [CITED: npm registry + Context7 /pocketbase/js-sdk] | `EventSource` polyfill for PB realtime in Node | README-verified: `import { EventSource } from "eventsource"; global.EventSource = EventSource`. **v5 is `"type": "module"` ESM-only** [CITED: npm registry] — planner must handle CJS/ESM interop (see Pitfall 3) |
| `tsx` | `^4.23.15` (dev-only runner) [CITED: npm registry] | Dev watch mode | Never production (D-03: compiled `tsc` emit for the 24/7 process) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino-pretty` | `^13.2.0` (dev only) [CITED: npm registry] | Readable local logs | Dev only; never on VM |
| `gitleaks` (Go binary, **not** npm) | v8.x via releases page / pre-commit hook `rev: v8.24.2` [CITED: https://github.com/gitleaks/gitleaks] | Pre-commit + history secret scan | `.pre-commit-config.yaml` with `gitleaks` hook id; `gitleaks git` for full-history drill (D-28). Note: upstream is feature-frozen (security patches only, focus moved to Betterleaks) — fine for this use |
| `turso` CLI | latest | Create DB + tokens + apply DDL | One-time provisioning + rebuild script (`turso db create`, `db tokens create`) [CITED: Context7 /tursodatabase/turso-docs quickstart] |
| `sqlite3` CLI | system package | PB `.backup` + restore drill | Nightly `sqlite3 pb_data/data.db ".backup backup.db"` on VM (binary present locally ✓; must be installed on VM image) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node-cron` v4 | `cron` (`CronJob`, `waitForCompletion`) / BullMQ+Redis / system cron | `cron` is the kelektiv-family alternative with equivalent overlap guard — but the locked API (`schedule` + `noOverlap` + `maxRandomDelay`) is `node-cron` v4; BullMQ needs Redis on the VM (rejected: extra stateful service); system cron loses jitter/noOverlap ergonomics |
| gitleaks binary | `secretlint` (npm) / `git-secrets` | npm-native is easier in CI, but gitleaks default ruleset + `git` history mode is the proven path; keep gitleaks, fetch ARM64 binary in rebuild script |
| Cloudflare Pages shell | Tunnel-served static from VM | Pages keeps VM serving zero bytes (reclaim/RAM margin); tunnel route reserved for future SSE passthrough (Phase 7) |
| Turso cold | Cloudflare D1 / Neon | PROJECT.md already decided Turso (5GB + plain SQLite semantics); do not relitigate |

**Installation:**
```bash
corepack enable && corepack prepare pnpm@10 --activate
pnpm init
pnpm add -D typescript@~5.9 tsx@^4 vitest@^3.2.7
pnpm --filter @zod/scheduler add node-cron@^4.6.0
pnpm --filter @zod/db-hot add pocketbase@^0.28.0 eventsource@^5.1.3
pnpm --filter @zod/db-cold add @libsql/client@^0.18.0
pnpm --filter @zod/shared add zod@^4 pino@^10 dotenv@^16.6.1
pnpm --filter @zod/shared add -D pino-pretty
```

**Version verification:** All versions above confirmed via `npm view <pkg> version` / `versions --json` on 2026-10-15 (see Environment + Sources). Training-data pins that no longer resolve: `pocketbase@^0.30` (max `0.28.1`), `@libsql/client@^0.15` (excludes `0.18.0`), `vitest@latest` (now `5.0.4`), `typescript@latest` (now `7.x` dev), `dotenv@latest` (`18.0.8`), `pnpm@latest` (`12.x`).

## Package Legitimacy Audit

Legitimacy gate run via `gsd_run query package-legitimacy check --ecosystem npm` on 2026-10-15. All `SUS` verdicts below carry **only** the `too-new` reason (a release published within days) on long-established packages with correct repo URLs and 25M–346M weekly downloads — the recency heuristic, not a real signal. Per protocol they are kept with inline flags; planner adds `checkpoint:human-verify` before each install.

| Package | Registry | Weekly DLs | Source Repo | Verdict | Disposition |
|---------|----------|-----------|-------------|---------|-------------|
| `node-cron` | npm | 5.0M | github.com/node-cron/node-cron | OK | Approved — install `node-cron@^4.6.0` from registry |
| `pocketbase` | npm | 233K | github.com/pocketbase/js-sdk | OK | Approved — install `pocketbase@^0.28.0` |
| `@libsql/client` | npm | 3.8M | github.com/tursodatabase/libsql-client-ts | OK | Approved — install `@libsql/client@^0.18.0` |
| `typescript` | npm | 307M | github.com/microsoft/TypeScript | OK | Approved — pin `~5.9`, not latest |
| `zod` | npm | 346M | github.com/colinhacks/zod | SUS (too-new only) | Flagged — `zod` [WARNING: flagged as suspicious — verify before using.] |
| `pino` | npm | 54M | github.com/pinojs/pino | SUS (too-new only) | Flagged — `pino` [WARNING: flagged as suspicious — verify before using.] |
| `pino-pretty` | npm | 25M | github.com/pinojs/pino-pretty | SUS (too-new only) | Flagged — `pino-pretty` [WARNING: flagged as suspicious — verify before using.] |
| `vitest` | npm | 125M | github.com/vitest-dev/vitest | SUS (too-new only) | Flagged — `vitest` [WARNING: flagged as suspicious — verify before using.] |
| `dotenv` | npm | 192M | github.com/motdotla/dotenv | SUS (too-new only) | Flagged — `dotenv` [WARNING: flagged as suspicious — verify before using.] |
| `eventsource` | npm | 67M | github.com/EventSource/eventsource | SUS (too-new only) | Flagged — `eventsource` [WARNING: flagged as suspicious — verify before using.] |
| `tsx` | npm | 97M | github.com/privatenumber/tsx | SUS (too-new only) | Flagged — `tsx` [WARNING: flagged as suspicious — verify before using.] |

**Postinstall check** (`npm view <pkg> scripts.postinstall`): `pocketbase`, `eventsource` → none. `node-cron` v4 check inconclusive via view; no postinstall historically — no flag.
**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious (SUS):** zod, pino, pino-pretty, vitest, dotenv, eventsource, tsx — planner inserts `checkpoint:human-verify` before each install (all recency-only on established packages).

> `kelektiv/node-cron` (GitHub shorthand from prior stack docs) was deliberately **not** legitimized as an install specifier: it resolves to `github:kelektiv/node-cron` (npm `EALLOWGIT`-refused in hardened environments, unpinned git dependency, and it names the wrong package family — see correction §1). The legitimate specifier is registry `node-cron` (verdict OK above).

## Architecture Patterns

### System Architecture Diagram (Phase 1 scope)

```
                    ┌─────────────────────────────────┐
                    │        Cloudflare edge          │
                    │  Access: Allow + Include        │
                    │  Emails:<owner> (deny default)  │
                    └───────┬─────────────▲───────────┘
                            │             │ dual-heartbeat
                    Pages   │             │ push-OUT (VM→checker)
                    static  │             │ poll-IN (checker→tunnel)
                    shell   │             │
                            ▼             │
┌──────────────────────────────────────────────────────┐
│ Oracle ARM VM (closed firewall, 0 inbound ports)      │
│                                                      │
│  scheduler (node, tsc emit, systemd restart=always)  │
│  ┌──────────────────────────────────────────────┐    │
│  │ single scheduler module (owns ALL jobs)      │    │
│  │  events 15-30m │ jobs 30-60m │ local 2-4h   │    │
│  │  social 45-90m jitter │  noOverlap │ Asia/   │    │
│  │  Kolkata │ duration metrics → telemetry      │    │
│  └──────────────────┬───────────────────────────┘    │
│                     │ stub ticks (no real polling)    │
│  ┌──────────────────▼───────────────────────────┐    │
│  │ memory clients (packages/db-hot + db-cold)   │    │
│  │  PB SDK ──► localhost:8090 (NEVER 0.0.0.0)   │    │
│  │  libsql ──► Turso cloud (url_hash PK reads)  │    │
│  └──────────────────────────────────────────────┘    │
│  pocketbase binary (pb_data on block volume)         │
│  cloudflared (outbound QUIC 7844, systemd service)   │
│  2.5GB wired-cache buffer (reclaim defense)          │
│  env-only secrets │ pino JSON→stdout (journald)      │
└──────────────────────────────────────────────────────┘
         │ sqlite3 .backup nightly ──► object storage (agent's discretion)
```

File-to-implementation mapping: `apps/scheduler` (entrypoint + registry), `packages/config` (env schema, cadences), `packages/logger` (pino base + redact), `packages/db-hot` (PB client, schemas-as-code, drills), `packages/db-cold` (Turso client, DDL, drills), `packages/dedup` (fingerprint fn — pure, unit-tested), `infra/` (cloudflared config + systemd units, oracle runbook, rebuild script), `apps/dashboard` (static shell for Pages deploy).

### Recommended Project Structure

```
zod/
├── pnpm-workspace.yaml   # packages: apps/*, packages/*
├── package.json          # private:true, engines: node>=22, packageManager: pnpm@10
├── tsconfig.base.json    # strict, nodenext/es2022, declaration emit
├── vitest.config.ts      # test.workspace: per-package configs (v3 key!)
├── .env.example          # placeholders only — real .env gitignored, 0600
├── .pre-commit-config.yaml  # gitleaks hook
├── .gitleaks.toml        # optional extends (custom rules, allowlists)
├── apps/
│   ├── scheduler/        # entrypoint: env.parse() → logger → registry.start()
│   ├── bot/              # SKELETON only (package.json + entry stub; gateway in Phase 4/6)
│   └── dashboard/        # static shell (index.html) → deployed to Pages
├── packages/
│   ├── config/           # zod env schema + cadence/jitter table (z.infer types)
│   ├── logger/           # pino base (redact) + child() helper
│   ├── db-hot/           # PB client (AsyncAuthStore), collection DDL notes, wipe-drill
│   ├── db-cold/          # libsql client, Turso DDL (ledger + taste), seed, wipe-drill
│   ├── dedup/            # fingerprint() pure fn + two-tier check (hot→cold)
│   └── scheduler/        # job registry, single-flight wrapper, duration metrics, stub jobs
└── infra/
    ├── cloudflared/      # config.yml, systemd unit (cloudflared + app units)
    ├── pocketbase/       # backup script (sqlite3 .backup), restore notes
    └── oracle/           # rebuild.sh (one command), firewall notes, runbook.md
```

### Pattern 1: Single scheduler module with named, instrumented jobs
**What:** One registry owns every `cron.schedule()` call; each job gets `name`, `timezone: 'Asia/Kolkata'`, `noOverlap: true`, `maxRandomDelay` jitter, a per-task `logger`, and `execution:overlap` / duration telemetry. Stub jobs in Phase 1 do no polling — they log + record duration.
**When to use:** Always — single-flight is a framework property (PITFALLS Pitfall 12), not per-pipeline boilerplate.
**Example:**
```typescript
// Source: Context7 /node-cron/node-cron README + /websites/nodecron api-reference
import cron from 'node-cron';
import type { Logger } from '../logger';

export function registerStubJobs(log: Logger) {
  const jobs = [
    { name: 'events-stub',   expr: '*/20 * * * *', maxRandomDelay: 5 * 60_000 },
    { name: 'jobs-stub',     expr: '*/45 * * * *', maxRandomDelay: 10 * 60_000 },
    { name: 'local-stub',    expr: '0 */3 * * *',  maxRandomDelay: 20 * 60_000 },
    { name: 'social-stub',    expr: '*/60 * * * *', maxRandomDelay: 25 * 60_000 },
  ];
  for (const j of jobs) {
    const task = cron.schedule(j.expr, async () => {
      const t0 = Date.now();
      log.child({ job: j.name }).info('tick start');
      // Phase 1: stub only — real poll logic arrives Phase 2+
      log.child({ job: j.name }).info({ durationMs: Date.now() - t0 }, 'tick done');
    }, { name: j.name, timezone: 'Asia/Kolkata', noOverlap: true, maxRandomDelay: j.maxRandomDelay });
    task.on('execution:overlap', () => log.child({ job: j.name }).warn('tick skipped: previous run pending'));
    task.start();
  }
}
```

### Pattern 2: Fail-fast zod env gate at entrypoint
**What:** `dotenv.config()` then `Env.parse(process.env)`; any missing/invalid secret throws before any client constructs. Types flow via `z.infer`.
**When to use:** Every app entrypoint (`apps/scheduler`, later `apps/bot`).
**Example:**
```typescript
// Source: Context7 /colinhacks/zod (z.object/.parse/z.infer) + dotenv convention
import * as z from 'zod';
import 'dotenv/config';

const Env = z.object({
  PB_URL: z.string().default('http://127.0.0.1:8090'),
  PB_SERVICE_EMAIL: z.email(),
  PB_SERVICE_PASSWORD: z.string().min(1),
  TURSO_DATABASE_URL: z.string(),
  TURSO_AUTH_TOKEN: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
export type Env = z.infer<typeof Env>;
export const env: Env = Env.parse(process.env); // throws on missing secrets — boot fails loudly
```

### Pattern 3: Redacting pino base + child loggers
**What:** One base logger with `redact.paths` covering every secret-shaped field; per-pipeline `child({pipeline})` bindings. Raw JSON to stdout (journald); `pino-pretty` transport dev-only.
**When to use:** All logging from Phase 1 onward; grep-verify no raw header dumps in CI.
**Example:**
```typescript
// Source: Context7 /pinojs/pino (redact option, logger.child)
import pino from 'pino';
import { env } from '@zod/config';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.cookie', '*.authToken',
            'TURSO_AUTH_TOKEN', 'PB_SERVICE_PASSWORD', 'headers.authorization', 'headers.cookie'],
    censor: '[Redacted]',
  },
});
export const child = (bindings: Record<string, unknown>) => logger.child(bindings);
```

### Pattern 4: PocketBase client with shared service-account auth
**What:** Single PB client per process; `AsyncAuthStore` persists the service-account token (file with `0600` or env-seeded) so bot + scheduler share one identity; `global.EventSource` assigned before any `subscribe()` call (live boards are Phase 7, but the wiring is proven now).
**When to use:** `packages/db-hot` client factory.
**Example:**
```typescript
// Source: Context7 /pocketbase/js-sdk (AsyncAuthStore ctor, EventSource polyfill, custom auth store)
import PocketBase, { AsyncAuthStore } from 'pocketbase';
import { EventSource } from 'eventsource';
import { env } from '@zod/config';

global.EventSource = EventSource as unknown as typeof globalThis.EventSource;

const store = new AsyncAuthStore({
  save: async (serialized) => { /* write 0600 token file */ },
  initial: undefined, // load from token file at boot
});
export const pb = new PocketBase(env.PB_URL, store);
await pb.collection('_superusers').authWithPassword(env.PB_SERVICE_EMAIL, env.PB_SERVICE_PASSWORD);
```

### Pattern 5: Turso remote-only client + ledger DDL with hash-PK point lookups
**What:** `createClient({url, authToken})` only — no `file:`/`syncUrl` (D-11). `tombstone_ledger` keyed on `url_hash TEXT PRIMARY KEY` so the pre-scrape check is a single-row `SELECT`, never a scan (PITFALLS Pitfall 11). DDL applied idempotently from a checked-in `.sql` file by the rebuild script.
**When to use:** `packages/db-cold` client + `infra/oracle/rebuild.sh`.
**Example:**
```typescript
// Source: Context7 /tursodatabase/turso-docs (createClient, execute DDL + parameterized queries)
import { createClient } from '@libsql/client';
import { env } from '@zod/config';

export const turso = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

// infra/turso/schema.sql (applied with IF NOT EXISTS — rerunnable)
await turso.execute(`CREATE TABLE IF NOT EXISTS tombstone_ledger (
  url_hash TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
  terminal_status TEXT NOT NULL, source TEXT, decided_at TEXT NOT NULL)`);
await turso.execute(`CREATE TABLE IF NOT EXISTS taste_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
  rule TEXT NOT NULL, weight REAL NOT NULL DEFAULT 1.0, created_at TEXT NOT NULL)`);
await turso.batch([
  { sql: 'INSERT OR IGNORE INTO tombstone_ledger VALUES (?,?,?,?,?)', args: [h, fp, 'routed', src, now] },
]);
```

### Pattern 6: Pure fingerprint function (the <5ms contract)
**What:** Normalize URL (lowercase host, strip tracking params/fragments/trailing slash) + `title|date|organizer` → SHA-256 hex. Pure function, unit-tested with must-match/must-differ fixtures. Two-tier check: PB `fingerprint_hash = ?` (localhost) then Turso `url_hash = ?` point lookup; both single-row.
**When to use:** `packages/dedup`; every future pipeline calls it pre-scrape (D-12).

### Anti-Patterns to Avoid
- **`pnpm add kelektiv/node-cron` (GitHub shorthand):** installs an unpinned git tarball of the wrong package family; refuses under hardened npm (`EALLOWGIT` observed this session). Use registry `node-cron@^4.6.0`.
- **Caret ranges on `0.x` minors:** `^0.15` ≠ "0.15 or newer" — it caps below `0.16.0`. Pin `^0.18.0` / `^0.28.0` explicitly.
- **PB bound to `0.0.0.0` or `--http=0.0.0.0:8090`:** exposes the admin UI to the open internet the moment any firewall rule slips. Bind `127.0.0.1:8090` and let the tunnel be the only path.
- **`sudo cloudflared service install` with a user-owned config:** `$HOME` becomes `/root` under sudo and the service can't find `config.yml` [CITED: Cloudflare as-a-service docs]. Pass `--config /home/<USER>/.cloudflared/config.yml` explicitly.
- **Access `Include Everyone` / OTP-only rules:** makes the "locked" shell public [CITED: Cloudflare Access misconfigurations docs]. Owner-only = `Allow` + `Include Emails`.
- **`.env` committed "temporarily":** history rewrite is the only fix (D-06/D-28). `.env.example` + gitleaks hook land in the first commit, before any secret exists.
- **Vitest v3 config with `test.projects`:** that key is v5-only; v3 uses `test.workspace`. Wrong key = silently ignored projects.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling + overlap guard | `setInterval` + boolean flag | `node-cron` v4 (`noOverlap`, `maxRandomDelay`, `execution:*` events) | Edge cases (missed-execution tolerance, DST in `Asia/Kolkata`, event emission, per-task loggers) are already handled and tested |
| Secret scanning | grep for `sk-` in a hook | `gitleaks` binary + pre-commit hook + `gitleaks git` history drill | 29.9k-star default ruleset, entropy checks, allowlists, SARIF output; custom regexes rot |
| Tunnel + edge auth | Nginx + basic-auth + open ports | `cloudflared` + Zero Trust Access | Outbound-only, no origin exposure, SSE covered by the same policy, zero app-auth code |
| PB auth persistence | Hand-rolled token file + refresh timers | `AsyncAuthStore` | SDK-owned refresh/invalidation semantics; custom stores only implement `save/clear/initial` |
| SQLite backup | `cp pb_data/data.db` while running | `sqlite3 data.db ".backup main backup.db"` | `.backup` takes a consistent snapshot against WAL mode; a raw copy can be corrupt mid-write |
| UUID/token generation (fingerprints) | `Math.random().toString(36)` | `node:crypto` `createHash('sha256')` | Fingerprints must be stable across rebuilds — same input, same hash, forever |
| Service supervision | `nohup ... &` + hope | systemd units (`Restart=always`) for scheduler, PB, cloudflared | Restart semantics, journald capture, boot ordering (`After=network-online.target`) |

**Key insight:** Phase 1's value is entirely in boring, supervised, reproducible infrastructure. Every hand-rolled shortcut here (a flag instead of `noOverlap`, a copy instead of `.backup`, a port instead of a tunnel) becomes a 3am page or an irreversible data/secret loss that the rebuild runbook cannot fix.

## Common Pitfalls

### Pitfall 1: Installing the wrong scheduler package
**What goes wrong:** `pnpm add kelektiv/node-cron` pulls a git tarball (unpinned, registry-bypass) — and Context7 shows `/kelektiv/node-cron` documents the `cron`-package `CronJob` API (`waitForCompletion`, `CronJob.from`), a different library from the locked `schedule(expr, fn, {noOverlap, maxRandomDelay})` API. Code written against one fails against the other.
**Why it happens:** Same maintainer nickname, similar names, stale guides.
**How to avoid:** `node-cron@^4.6.0` from the npm registry only (verdict OK, 5M/wk, repo `node-cron/node-cron`). Assert `noOverlap` + `maxRandomDelay` exist in a boot-time smoke test.
**Warning signs:** Lockfile contains `github:` URLs; `schedule()` third-arg options type-error.

### Pitfall 2: Unresolvable version pins from stale training data
**What goes wrong:** `pocketbase@^0.30` (max `0.28.1`), bare `latest` tags pulling vitest 5 / TS 7-dev / dotenv 18 / pnpm 12 — install fails or behavior silently changes.
**Why it happens:** Stack docs snapshot versions; registries move on.
**How to avoid:** Every pin in PLAN.md cross-checked with `npm view` this session (table in Standard Stack). Re-verify at execution start — cheap, `npm view` × 11.
**Warning signs:** `ETARGET` / `No matching version found` on first `pnpm install`.

### Pitfall 3: `eventsource` v5 ESM-only vs `tsc` CommonJS emit
**What goes wrong:** `eventsource@5` declares `"type": "module"` [CITED: npm registry]; under `module: commonjs` emit, `import { EventSource } from 'eventsource'` relies on interop, and `global.EventSource = EventSource` needs a type cast. A `moduleResolution: node` tsconfig may fail to resolve its `exports` map.
**Why it happens:** v4→v5 was a CJS→ESM flip; PB README examples predate it.
**How to avoid:** Set `module: nodenext` (or `bundler`) + `moduleResolution: nodenext` in `tsconfig.base.json`; keep the cast pattern from the code example; cover client construction in a unit test with a mocked fetch layer.
**Warning signs:** `TS2307` on `'eventsource'`; `EventSource is not a constructor` at runtime.

### Pitfall 4: PocketBase reachable beyond localhost
**What goes wrong:** Default PB serves on all interfaces; combined with any Oracle security-list slip, the admin UI + data are internet-facing with only password auth.
**Why it happens:** Tutorials run `--http=0.0.0.0:8090` for Docker convenience and the flag gets copied to the VM unit file.
**How to avoid:** Unit file hardcodes `--http=127.0.0.1:8090`; port-scan drill (D-18) asserts nothing listens publicly; Access policy never fronts PB directly in Phase 1.
**Warning signs:** `ss -tlnp` shows `*:8090` instead of `127.0.0.1:8090`.

### Pitfall 5: cloudflared service can't find its config
**What goes wrong:** `sudo cloudflared service install` resolves `$HOME/.cloudflared` as `/root/.cloudflared`; the service starts, finds no tunnel UUID, crash-loops — dashboard dark, watchdog pages.
**Why it happens:** Documented behavior in the as-a-service guide; easy to miss.
**How to avoid:** `sudo cloudflared --config /home/<USER>/.cloudflared/config.yml service install`; assert `systemctl is-active cloudflared` in the rebuild script; dual-heartbeat distinguishes tunnel-down from VM-down (PITFALLS Pitfall 13).
**Warning signs:** `journalctl -u cloudflared` shows "no tunnel UUID" / missing credentials file.

### Pitfall 6: Downloading the wrong PB architecture
**What goes wrong:** `linux_amd64` binary on the Ampere (ARM) VM → `exec format error`; provisioning looks green until the PB unit first starts.
**Why it happens:** Copy-paste from x86 tutorials; filename differs by one token.
**How to avoid:** Rebuild script downloads `pocketbase_<ver>_linux_arm64.zip` (asset name verified to exist for v0.35.0 [CITED: release assets API]) + verifies against `checksums.txt`; assert `uname -m` == `aarch64` before download.
**Warning signs:** `cannot execute binary file` in `journalctl -u pocketbase`.

### Pitfall 7: Secrets enter git before the hook exists
**What goes wrong:** `.env` with the Turso token committed in the scaffold commit; the gitleaks hook added later can't retro-fix history; rotation + `filter-repo` required.
**Why it happens:** Hook and `.gitignore` land after the first "real" commit.
**How to avoid:** First commit contains `.gitignore` (`.env`, `*.json` credentials, `pb_data/`), `.env.example`, `.pre-commit-config.yaml` — zero secrets. D-28 history-scan drill enforces it.
**Warning signs:** `gitleaks git` reports any finding; `git log --all -p | grep -i token` non-empty.

## Code Examples

### Scheduler stub + forced-overlap drill (D-23/D-24/D-27)
```typescript
// Source: Context7 /node-cron/node-cron (noOverlap, TaskEvent execution:overlap)
import cron from 'node-cron';

// Drill: schedule a 1s job whose handler sleeps 3s with noOverlap:true,
// assert an 'execution:overlap' event fires and only one run completes.
const overlaps: string[] = [];
const task = cron.schedule('* * * * * *', async () => {
  await new Promise((r) => setTimeout(r, 3000));
}, { name: 'overlap-drill', timezone: 'Asia/Kolkata', noOverlap: true });
task.on('execution:overlap', () => overlaps.push(new Date().toISOString()));
task.start();
```

### pnpm workspace root + vitest v3 workspace
```yaml
# pnpm-workspace.yaml — Source: https://pnpm.io/workspaces
packages:
  - 'apps/*'
  - 'packages/*'
```
```jsonc
// package.json (root) — private monorepo root
{ "private": true, "packageManager": "pnpm@10.34.7",
  "engines": { "node": ">=22" } }
```
```typescript
// vitest.config.ts — v3 key is `workspace`, NOT `projects` (v5-only)
// Source: Context7 /vitest-dev/vitest (projects/workspaces guide)
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { workspace: ['./packages/*/vitest.config.ts'] } });
```

### cloudflared tunnel config + service
```yaml
# infra/cloudflared/config.yml
# Source: https://developers.cloudflare.com/.../create-local-tunnel/ (tunnel + credentials-file fields)
tunnel: <Tunnel-UUID>
credentials-file: /home/zod/.cloudflared/<Tunnel-UUID>.json
ingress:
  - hostname: dash.example.com
    service: http://localhost:3000   # Phase 7 SSE origin; Phase 1 serves the static shell via Pages
  - service: http_status:404
```
```bash
# Source: https://developers.cloudflare.com/.../as-a-service/linux/
sudo cloudflared --config /home/zod/.cloudflared/config.yml service install
systemctl start cloudflared && systemctl status cloudflared
```

### PB backup + Turso-ledger wipe drill (D-10/D-16)
```bash
# nightly backup (VM cron/systemd timer) — consistent WAL snapshot
sqlite3 /vol/pb_data/data.db ".backup main /vol/backups/pb-$(date +%F).db"
# simulated wipe drill: stop PB, move pb_data aside, restore latest backup,
# re-run infra/turso/schema.sql (IF NOT EXISTS), boot, assert:
#   SELECT COUNT(*) FROM opportunities == pre-wipe AND
#   turso tombstone_ledger row count unchanged AND
#   new writes flow to both hot and cold
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-cron` v3 (no `noOverlap`) | `node-cron` v4 (`noOverlap`, `maxRandomDelay`, `execution:overlap`, `distributed`) | v4.0.0, May 2025; now `4.6.0` [VERIFIED: npm registry + Context7] | Locked D-24 API only exists on v4 — v3 cannot satisfy the success criterion |
| `test.workspace` (vitest ≤4) | `test.projects` (vitest 5) | vitest 5.0, 2026 [CITED: Context7 /vitest-dev/vitest blog] | Stay on v3 per lock → use `workspace` key; planner must not copy v5 examples |
| `eventsource` v4 (CJS) | `eventsource` v5 (ESM-only) | v5.0 [CITED: npm registry] | tsconfig must be ESM-aware (`nodenext`); see Pitfall 3 |
| PB server `v0.35.x` era | PB server `v0.40.5` latest (Go `net/http` DoS fix in Go 1.27.2) | 2026-10-08 [CITED: github release notes] | Upgrade decision open (Q1); SDK `0.28.x` works against both per SDK compat range |
| gitleaks active development | gitleaks feature-frozen (security patches only; Betterleaks is the successor) | 2026 [CITED: https://github.com/gitleaks/gitleaks README] | No impact for pre-commit/history scanning — do not chase the successor in Phase 1 |

**Deprecated/outdated:**
- `kelektiv/node-cron` GitHub-shorthand install: wrong package family + unpinned git dep — never use; registry `node-cron@^4.6.0` instead
- PB `--http=0.0.0.0` tutorials, `test.projects` on vitest 3, `pocketbase@^0.30` / `@libsql/client@^0.15` pins: all unresolvable or insecure — superseded above

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Oracle Always Free shape is Ampere A1 (4 OCPU/24GB max) + attached block volume for `pb_data`; 2.5GB buffer ≈ 22–30% of a ~8–12GB instance | Arch map / Pitfalls | MEDIUM — if the instance is smaller, the buffer starves the scheduler; planner must size buffer from actual `free -m` at provisioning and assert ≥22% with margin |
| A2 | Outbound QUIC UDP/7844 is reachable from the VM (tunnel pre-check passes) | Standard Stack | MEDIUM — if blocked, tunnel never establishes; mitigation: `cloudflared` falls back to QUIC-over-HTTPS automatically, but planner must include the connectivity pre-check step |
| A3 | Turso free tier (5GB / 500M reads / 10M writes) comfortably fits tombstone + taste volume in v1 | Patterns | LOW — writes are batched and rare in Phase 1; burn-rate gauge lands Phase 7 |
| A4 | `turso` CLI + apt `cloudflare-main` repo support `linux/arm64` | Env availability | LOW — both publish ARM artifacts, but planner must assert arch in rebuild script rather than assume |
| A5 | External watchdog (UptimeRobot-style) free tier suffices for dual-heartbeat | Open Q3 | LOW — planner's discretion; any dead-man-switch ping service works |

## Open Questions (RESOLVED)

1. **PB server `v0.35.x` (locked D-14) vs `v0.40.5` latest? — RESOLVED:** default honors the D-14 lock (`v0.35.x`); the upgrade choice is delegated to the 01-04 `checkpoint:human-verify` gate, which presents the `v0.40.5` Go `net/http` DoS-fix security delta and records the operator's explicit pick in the SUMMARY before rebuild.sh downloads any release asset.
   - What we know: `v0.35.0` tag + `linux_arm64` asset verified [CITED: release assets API]; `v0.40.5` (2026-10-08) includes a Go `net/http` DoS fix upstream advises applying [CITED: release notes]; SDK `0.28.x` supports server `v0.29+`.
   - What's unclear: whether any Phase 1–7 dependency needs `>0.35` APIs; whether the owner accepts a newer-than-locked server.
   - Recommendation: planner keeps `v0.35.x` as default (honors the lock) but adds a `checkpoint:human-verify` presenting the `v0.40.5` security delta; executor asserts the chosen version's checksum in rebuild.sh either way.

2. **D-24 says "`kelektiv/node-cron` (never `node-cron`)" but the locked API is `node-cron` v4's — which to honor? — RESOLVED:** the *API + behavior* (`schedule` with `noOverlap` + `maxRandomDelay` + `timezone`, per D-24 intent) stays locked; only the *specifier* is corrected to registry `node-cron@^4.6.0`, which is the package that implements that exact API (the `kelektiv/*` GitHub shorthand names a different package family and is refused under git-fetch restrictions). Plans 01-03 and 01-04 install from the registry specifier.
   - What we know: registry `node-cron@4.6.0` (repo `node-cron/node-cron`) implements exactly `schedule(expr, fn, {timezone, noOverlap, maxRandomDelay})` [VERIFIED: Context7 + npm]; the `kelektiv/*` GitHub path names the `cron`-family `CronJob` API and is uninstallable under git-fetch restrictions (observed `EALLOWGIT`).
   - Recommendation: planner treats the *API + behavior* (noOverlap + jitter + named jobs) as the locked intent and the *specifier* as corrected to registry `node-cron@^4.6.0`. Flag in plan review, not a user re-discuss — the intent is unambiguous.

3. **Watchdog provider + backup object-storage target (agent's discretion)? — RESOLVED:** planner/executor picks defaults under agent's discretion (dead-man-switch ping service + S3-compatible bucket) with env-plumbed URLs/keys so either swaps without code changes, and records the chosen provider plus target in the plan SUMMARY. No user decision required unless the owner has existing accounts to reuse.
   - What we know: needs are a dead-man-switch ping service (free) and an S3-compatible bucket for nightly `.backup` files.
   - Recommendation: planner picks defaults (e.g., UptimeRobot cron + Cloudflare R2 free tier) with env-plumbed URLs/keys so either can be swapped without code changes. No user decision required unless the owner has existing accounts to reuse.

## Environment Availability

> Local workstation ≠ target VM. The table marks what was probed locally on 2026-10-15; the rebuild script must assert the VM-side column at provisioning time.

| Dependency | Required By | Available (local) | Version | Fallback / VM note |
|------------|------------|-------------------|---------|--------------------|
| Node 22.x | scheduler/bot runtime | ✗ (local: v26.11.1) | — | Use `nvm`/nodesource Node 22 on VM; local dev should also use 22 (`engines` field enforces) |
| pnpm 10.x | workspaces | ✗ (not installed locally) | 10.x latest `10.34.7` [CITED: npm] | `corepack prepare pnpm@10 --activate` on both machines |
| `cloudflared` | tunnel | ✗ | — | apt `cloudflare-main` on VM (Ubuntu); not needed locally |
| `sqlite3` CLI | backup/restore drill | ✓ | system | Must be in VM image for backup timer |
| Docker | optional (gitleaks alt, future Crawl4AI) | ✓ | present | Not required Phase 1 |
| `nmap`/port-scan | D-18 verify step | ✗ | — | Fallback: `ss -tlnp` + loopback-vs-public assertion script (better: asserts binding, not just closed ports) |
| `gitleaks` | D-28 pre-commit + history drill | ✗ | v8.x [CITED: GitHub] | Fetch `linux_arm64` binary in rebuild/dev-setup script; pre-commit framework optional |
| Oracle VM (aarch64) | everything | ✗ (local: x86_64 CachyOS) | — | All arch-sensitive steps (PB `linux_arm64` zip, apt arm64) assert `uname -m` in rebuild.sh |
| Turso account + DB | MEM-03 | unknown | — | Planner's first infra task: `turso db create` + token; secrets to env only |
| Cloudflare account + domain | tunnel + Pages + Access | unknown | — | Owner prerequisite; planner must list as Day-0 checklist with the Access email rule |

**Missing dependencies with no fallback:**
- Oracle VM access, Turso account, Cloudflare account/domain — planner must treat these as Day-0 owner prerequisites; nothing else in the phase can be proven without them.

**Missing dependencies with fallback:**
- Port scanner → `ss`-based bind assertion; gitleaks → binary fetch in setup script; Node 22 → version manager on VM.

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | vitest `^3.2.7` (v3 line per D-05) [CITED: npm registry] |
| Config file | none — see Wave 0 (root `vitest.config.ts` with `test.workspace` + per-package configs) |
| Quick run command | `pnpm vitest run --project unit` (<30s, pure functions only) |
| Full suite command | `pnpm vitest run` (unit + drill harnesses; infra drills run separately as scripts) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEM-01 | PB collections accept + return all schema fields (incl. GC-ready `end_date`/`status`) | integration | `pnpm --filter @zod/db-hot test` (needs local PB in CI) | ❌ Wave 0 |
| MEM-02 | telemetry rows expire/trim by 24h age rule | unit (purge predicate) | `pnpm vitest run packages/db-hot` | ❌ Wave 0 |
| MEM-03 | fingerprint stable + two-tier check hits hot then cold; tombstone PK point-lookup | unit + integration | `pnpm vitest run packages/dedup` / `packages/db-cold` (Turso needs test DB) | ❌ Wave 0 |
| OPS-01 | no overlapping ticks (forced-overlap skip + counter); stub durations recorded | unit (drill harness) | `pnpm vitest run packages/scheduler` | ❌ Wave 0 |
| D-06 | env gate throws on missing secret; logger redacts secret paths | unit | `pnpm vitest run packages/config packages/logger` | ❌ Wave 0 |
| D-18/D-20 | zero public listeners; unauth UI+SSE rejected at edge | script drill (not vitest) | `bash infra/oracle/drills/port-scan.sh`, `edge-reject.sh` | ❌ Wave 0 |
| D-16/D-26 | wipe-restore drill + one-command rebuild | script drill (not vitest) | `bash infra/oracle/drills/wipe-restore.sh`, `rebuild.sh` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --project unit`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green + all four drill scripts green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` (root, `test.workspace`) + per-package `vitest.config.ts` files
- [ ] `packages/dedup/src/fingerprint.test.ts` — must-match/must-differ fixtures + URL normalization cases
- [ ] `packages/config/src/env.test.ts` — missing-secret throws; defaults apply
- [ ] `packages/logger/src/redact.test.ts` — secret paths censored, non-secrets pass through
- [ ] `packages/scheduler/src/overlap.test.ts` — forced-overlap skip + `execution:overlap` counter
- [ ] `infra/oracle/drills/*.sh` — port-scan, edge-reject, wipe-restore harnesses
- [ ] Ephemeral PB (local binary) + Turso test DB for integration tests — decide in planning (local PB binary vs. `pocketbase` npm test helper)

## Security Domain

ASVS Level 1 (`security_enforcement: true`, `security_asvs_level: 1` in config).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | PB `_superusers` service account (env creds) + Cloudflare Access owner-only edge wall; no app-auth code |
| V3 Session Management | partial | PB SDK token via `AsyncAuthStore` (0600 file); no user sessions in Phase 1 |
| V4 Access Control | yes | Access `Allow` + `Include Emails`; deny-by-default; PB bound to loopback (network-level control) |
| V5 Input Validation | yes | `zod` v4 `Env.parse()` + all external-boundary schemas; `z.infer` types |
| V6 Cryptography | yes (by avoidance) | No hand-rolled crypto — SHA-256 via `node:crypto`, TLS via Cloudflare/tunnel, tokens via env |
| V14 Configuration | yes | `.env.example` only in git; `0600` credential files; systemd `Restart=always`; version-pinned rebuild |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret in git history / logs | Info disclosure | gitleaks hook + `gitleaks git` drill; pino `redact.paths`; `.env` gitignored from commit #1 |
| PB admin exposed publicly | Info disclosure / Tampering | `127.0.0.1` bind + closed firewall + tunnel-only; port-scan drill |
| Zero Trust bypass (Everyone/Bypass rule) | Elevation | Owner-only `Allow`+`Include Emails`; no `Bypass` rules; unauth edge-reject drill covers UI *and* SSE paths |
| Tunnel credential theft (VM disk) | Info disclosure | Credentials file `0600`, never in repo/env dumps; rotation = `tunnel delete` + recreate in runbook |
| Reclaim wipes unreplicated hot state | Denial of service | RAM buffer + watchdog + bounded-lag cold mirror + tested rebuild (criteria 1+2) |

## Sources

### Primary (HIGH confidence → [VERIFIED])
- Context7 `/node-cron/node-cron` + `/websites/nodecron` — v4 `TaskOptions` (`noOverlap`, `maxRandomDelay`, `timezone`, `name`, `logger`), Overlap Prevention recipe, `TaskEvent` (`execution:overlap`), `TrackedPromise` skip mechanics
- Context7 `/pocketbase/js-sdk` — `EventSource` polyfill assignment, `AsyncAuthStore({save, clear?, initial})`, custom stores via `BaseAuthStore`
- Context7 `/tursodatabase/turso-docs` — `createClient({url, authToken})`, `execute()` DDL/parameterized writes, `turso db create` / `tokens create` quickstart
- npm registry (`npm view`, 2026-10-15) — `node-cron@4.6.0`, `pocketbase@0.28.1`, `@libsql/client@0.18.0`, `zod@4.6.7`, `pino@10.4.0`, `vitest 3.2.7`, `dotenv 16.6.1`, `eventsource@5.1.3` (+`"type":"module"`), `typescript 5.9.3`, `tsx@4.23.15`, `pnpm 10.34.7`; `EALLOWGIT` refusal of `kelektiv/node-cron` shorthand
- `package-legitimacy check` seam — OK: node-cron, pocketbase, @libsql/client, typescript; recency-only SUS: zod, pino, pino-pretty, vitest, dotenv, eventsource, tsx

### Secondary (MEDIUM confidence → [CITED])
- https://developers.cloudflare.com/.../create-local-tunnel/ (2026-10-13) — apt install, `tunnel create`, `config.yml`, `route dns`, `service install` reference, QUIC 7844 pre-check
- https://developers.cloudflare.com/.../as-a-service/linux/ (2026-04-17) — systemd install, `$HOME`/`/root` config mismatch, explicit `--config`
- https://developers.cloudflare.com/cloudflare-one/policies/access/ (2026-10-01) — Allow/Block/Bypass/Service-Auth, Include/Require/Exclude, Everyone-misconfiguration warnings
- https://github.com/gitleaks/gitleaks — v8 pre-commit config (`rev: v8.24.2`), `git`/`dir`/`stdin` modes, `gitleaks:allow`, feature-freeze notice
- Context7 `/colinhacks/zod`, `/pinojs/pino`, `/vitest-dev/vitest`, `/pocketbase/site` — env/validate, redact/child, `test.projects` (v5) vs `test.workspace` (v3)
- GitHub API: pocketbase `v0.40.5` release notes (Go 1.27.2 DoS fix) + `v0.35.0` asset list (`linux_arm64` verified); `v0.35.0` tag existence
- https://pnpm.io/workspaces — `pnpm-workspace.yaml`, `workspace:` protocol, `saveWorkspaceProtocol`

### Tertiary (LOW confidence → [ASSUMED])
- Oracle Ampere shape/sizing, QUIC reachability, Turso quota headroom, watchdog/backup-vendor picks — see Assumptions Log; all planner-verifiable at provisioning

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every Phase 1 package API verified via Context7 docs + registry versions + legitimacy gate this session
- Architecture: MEDIUM — monorepo/scheduler/memory patterns verified at the SDK level; VM-side specifics (Oracle shapes, QUIC egress) assumed pending provisioning
- Pitfalls: HIGH — each pitfall grounded in an observed fact (EALLOWGIT refusal, unresolvable pins, ESM flip, sudo-HOME docs, Everyone-misconfig docs)

**Research date:** 2026-10-15
**Valid until:** 2026-11-14 (stable surface; re-verify npm pins at execution start — one `npm view` pass)
