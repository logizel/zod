# Phase 1: Foundation - Context

**Gathered:** 2026-10-15
**Status:** Ready for planning

## Phase Boundary

The system gets a surviving home — provisioned Oracle ARM VM, live PocketBase hot + Turso cold memory, closed network via Cloudflare Tunnel + Zero Trust, and a kelektiv/node-cron scheduler skeleton that cannot stampede. Covers MEM-01, MEM-02, MEM-03, OPS-01. Does NOT build browser/sanitizer (Phase 2), LLM gateway (Phase 3), or any pipeline routing — only the contracts those layers will depend on.

## Implementation Decisions

### Monorepo scaffold shape
- **D-01:** Create full layout now — `apps/bot,scheduler,dashboard` + `packages/*` skeleton per research contract, to avoid re-scaffolding later — **Reversibility:** costly — renaming/moving packages touches all imports
- **D-02:** Pin Node 22.x + pnpm 10.x workspaces with strict isolation
- **D-03:** Production entry via compiled `tsc` emit (no JIT-transpile tax for 24/7 process); `tsx` dev-only
- **D-04:** Phase 1 packages are core-only: `config`, logger, env-validation, memory clients, scheduler skeleton. Browser/sanitize/LLM/discord-router packages arrive with Phase 2/3/4
- **D-05:** vitest 3 setup from day one for pure functions (parsers, fingerprint, routing helpers)
- **D-06:** Strict env gate — `dotenv` + `zod` `env.parse()` at entrypoint, fail boot on missing secrets; pino redacting logger; pre-commit secret scan; no secrets in git history
- **D-07:** Strict TypeScript + `zod` v4 at every external boundary (`z.infer` types everywhere; v3 fallback only on proven dep conflict)
- **D-08:** `pino` v10 JSON to stdout (journald-friendly) + per-pipeline child loggers; `pino-pretty` dev only

### Hot/cold memory depth
- **D-09:** Ship full schemas now — `opportunities`, `agent_telemetry`, `task_scratchpad`, `tombstone_ledger`, `taste_rules` with indexes — even though writers land later — **Reversibility:** one-way — schema change after data exists needs migration
- **D-10:** PocketBase ARM64 binary, bind `localhost:8090` only (never `0.0.0.0`), `pb_data` on block volume, nightly `sqlite3 .backup` to object storage — **Reversibility:** costly — data-dir move needs volume + backup path migration
- **D-11:** Turso remote-only via `@libsql/client` `createClient({url, authToken})`; `tombstone_ledger` `url_hash` PK never deleted; `taste_rules` seeded empty; no embedded replica/sync in v1
- **D-12:** Implement fingerprint fn + two-tier pre-scrape check in Phase 1 (normalize URL + title/date/organizer hash; hot PB check then Turso point-lookup; target <5ms)
- **D-13:** Realtime-ready now — `eventsource` polyfill + shared service account via `AsyncAuthStore` so bot + scheduler share auth; live SSE boards themselves stay Phase 7
- **D-14:** Pin versions per STACK.md — PB server `v0.35.x` + JS SDK `^0.30`, `@libsql/client ^0.15`
- **D-15:** GC-ready fields now — `end_date`, `status`, heavy-text columns + indexes so Phase 7 midnight GC has columns to purge; tombstones + taste rules retained
- **D-16:** Prove criterion 2 with automated simulated VM-wipe drill — restore PB backup + replay Turso cold ledger, assert opportunities + telemetry survive

### Tunnel + dashboard shell
- **D-17:** Phase 1 "locked shell" = static placeholder behind Zero Trust owner-only + supervised `cloudflared` systemd + Cloudflare Pages deploy now — proves criterion 3 without building boards — **Reversibility:** costly — URL + Access policy + tunnel route are depended on by Phase 7
- **D-18:** Zero open inbound firewall ports; `cloudflared` tunnel is the only ingress; verify with port scan; `localhost:8090` never exposed
- **D-19:** `cloudflared` supervised via systemd `restart=always`, token in env never in repo, dual-heartbeat monitoring (tunnel + scheduler pings) with alerts
- **D-20:** Automated Zero Trust edge-reject test — unauthenticated request to UI and SSE endpoint rejected before render
- **D-21:** Install `cloudflared` via apt `cloudflare-main` repo, auto-update on, version logged in runbook
- **D-22:** Shell is static only in Phase 1; PB SSE passthrough + slots/health-grid/boards are Phase 7

### Scheduler + reclaim defense
- **D-23:** Scheduler = framework + one stub job per cadence (events 15–30m, jobs 30–60m, local 2–4h, social 45–90m jitter) with duration metrics; single scheduler module owns all jobs; real poll logic arrives with Phase 2+
- **D-24:** `kelektiv/node-cron` (never `node-cron`) with `noOverlap: true` + `maxRandomDelay` jitter per job, `timezone: 'Asia/Kolkata'`
- **D-25:** Reclaim defense = tiny wired-cache process holding 2.5GB to keep 22–30% RAM + external watchdog alerting on silence — **Reversibility:** costly — removing buffer changes idle-reclaim risk profile
- **D-26:** One documented rebuild command restores VM + `pb_data` from block-volume backup + reapplies Turso schemas — tested end-to-end (criterion 1)
- **D-27:** Prove no-overlap with forced-overlap test — second tick skips while first pending; duration metrics to telemetry
- **D-28:** Secrets hygiene = pre-commit scan + redacting logger + env-only tokens; scan git history in Phase 1 drill

### Agent's Discretion
No "you decide" selections — user chose concrete options for all 28 decisions. Researcher/planner have flexibility on: watchdog provider choice, backup object-storage target, stub-job naming, heartbeat interval values, and exact index sets — as long as success criteria and locked decisions above hold.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + requirements
- `.planning/ROADMAP.md` Phase 1 section — goal, 4 success criteria, MEM-01/MEM-02/MEM-03/OPS-01 scope
- `.planning/REQUIREMENTS.md` MEM-01, MEM-02, MEM-03, OPS-01 rows + Traceability — exact memory + scheduler contracts
- `.planning/PROJECT.md` Context + Constraints + Key Decisions — Oracle ARM, PB-hot/Turso-cold, zero-port tunnel, TS monorepo, 2.5GB buffer, poll cadences

### Stack + architecture (research)
- `.planning/research/STACK.md` — install matrix: Node 22 + pnpm 10, discord.js v14, PB v0.35.x + SDK ^0.30 + eventsource polyfill, @libsql/client ^0.15 remote-only, cloudflared tunnel + Pages + Zero Trust, kelektiv/node-cron noOverlap/jitter, zod v4, pino v10, vitest 3, tsc emit
- `.planning/research/ARCHITECTURE.md` — layered pipeline, orchestrator + Task_Scratchpad STEP machine, memory hot/cold split, egress layer, build-order contract (memory/scratchpad first)
- `.planning/research/SUMMARY.md` Phase 1 implications — deliverables list (Ampere + closed FW, PB localhost-only + Turso schemas, supervised cloudflared + Zero Trust, cron framework + metrics, env-only + redacting logger + pre-commit scan, watchdog + dual-heartbeat, rebuild runbook) + pitfalls to avoid
- `.planning/research/PITFALLS.md` — Oracle reclaim, secret leakage, cron stampedes, tunnel-supervision gaps, Turso scan/index debt (Phase 1 gates)

## Existing Code Insights

### Reusable Assets
- None — greenfield repo (only `.planning/`, `AGENTS.md`, `README.md`, `LICENSE`). No `src/`, `apps/`, `packages/`, or `package.json` yet.

### Established Patterns
- None in code. Follow `.planning/research/STACK.md` install matrix and `PROJECT.md` constraints as the de-facto patterns (TS strict + zod inference, pino child loggers, single scheduler module, localhost-only PB).

### Integration Points
- No existing code to integrate with. Phase 1 creates the integration surface for Phase 2+ (memory schemas, scheduler registry, tunnel route, env contract).

## Specific Ideas

- Full `apps/bot,scheduler,dashboard` + `packages/*` skeleton now per research contract; core-only packages in Phase 1
- Fingerprint: normalized URL + title/date/organizer hash; hot-then-cold point lookup <5ms
- Proofs are automated drills, not manual checks: VM-wipe restore, unauth edge-reject, forced-overlap skip, port scan, git-history secret scan
- Static dashboard shell in Phase 1; live SSE/boards explicitly deferred to Phase 7

## Deferred Ideas

None — discussion stayed within phase scope. No scope creep raised; no todos folded (todo match count 0).

---

*Phase: 1-Foundation*
*Context gathered: 2026-10-15*
