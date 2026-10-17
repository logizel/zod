# Phase 7: Telemetry Dashboard + Ops Hardening - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

<domain>
## Phase Boundary

The owner watches the whole swarm live on a locked read-only dashboard that survives tunnel and VM failures. This phase delivers the rolling agent slots panel (live micro-step ticker incl. 429 baton-passes), the 2D pool health grid (READY/ACTIVE/60s-COOLDOWN/DAILY-CAP per provider-model bucket), and filterable read-only boards (Events Local/Travel/Online, TBA queue, Jobs Sys vs General, Loot, live audit & rejection log) served via Cloudflare Tunnel behind owner-only Cloudflare Zero Trust — plus MEM-05 midnight GC that purges heavy text on schedule while tombstones and taste rules survive, all proven by kill-tests.

All dashboard traffic hits the edge gate *before* anything renders. v1 stays read-only: no manual dashboard mutations, no UI-driven state changes — all learning flows through Discord reactions and #🧠-bot-training-chat.

Requirements locked in ROADMAP.md §Phase 7: DSH-01 (Zero Trust pre-render gate), DSH-02 (rolling agent slots + micro-step ticker over PB SSE), DSH-03 (2D pool health grid), DSH-04 (filterable read-only boards via tunnel, zero open inbound ports), MEM-05 (midnight GC purge heavy text 24h after end_date / 48h after rejection, retain tombstones + taste rules).

</domain>

<decisions>
## Implementation Decisions

### Hosting & data path

- **D-01:** Topology = Cloudflare Pages static UI + VM stream origin — Cloudflare Pages hosts the static dashboard; `infra/cloudflared/config.yml` already routes the dashboard hostname → `localhost:3000` (the "future stream origin" Phase 7 fills), reaching a small SSE-proxy + boards-API server on the VM through the tunnel. Matches Phase 1 D-17's "never from the VM origin (no shortcut)" note. When the tunnel dies, the UI still loads and can show a staleness banner instead of going fully dark (dashboard-only outage per Pitfall 13). — **Reversibility:** costly — URL + Access policy + tunnel route are depended on by the Phase 1 runbook and edge-reject drill.
- **D-02:** UI build = framework-free static — vanilla JS + EventSource + hand-rolled DOM on the existing static shell (`apps/dashboard/index.html`). No framework, no build step, no npm deps; Pages deploys as a straight file upload. Three panels + filters is well within vanilla reach. — **Reversibility:** reversible — swapping in a build/framework later is additive.
- **D-03:** Data path = hybrid SSE-live + GET-snapshot — one SSE stream carries live slots + health grid + board deltas; a small set of GET endpoints on the VM origin serves the initial board snapshot and filter queries. Connect once, backfill once, ride the stream. Simplest reconnection story and cleanest GET/stream split. — **Reversibility:** reversible — push-only or full-REST are later swaps within the same server.
- **D-04:** Zero Trust coverage = single Access policy covering both hostnames — same owner-email Allow rule + deny-by-default + zero-bypass already proven by `infra/oracle/drills/edge-reject.sh`. One policy to maintain across Pages UI and tunnel stream host. — **Reversibility:** reversible — separating policies later is an edge config change.
- **D-05:** Stream server = own systemd unit (`dashboard.service`, `restart=always`) alongside cloudflared/PocketBase/scheduler units in `infra/cloudflared/`. Crash or VM reboot brings it back automatically; consistent with Phase 1 ops model and keeps tunnel death dashboard-only. — **Reversibility:** reversible — folding into an existing process later is a deploy change.

### Live updates & failure surfacing

- **D-06:** Push cadence = coalesced push every ~3–5s — server subscribes to PocketBase realtime once (single shared event bus regardless of viewer count), batches changes, and pushes coalesced snapshots/deltas. Reconnect replay stays small; fan-out stays flat; a 3s-old ticker is imperceptible to a human watcher. Directly implements Pitfall 13's "bound SSE cost" guidance. — **Reversibility:** reversible — cadence is an internal server constant.
- **D-07:** Staleness surfacing = heartbeat every ~15s + amber staleness banner driven by last-event age — UI tracks last-event age and shows an amber banner ("stream stale — last update 4m ago") once it crosses a threshold. UI keeps loading because it's Pages-hosted. — **Reversibility:** reversible — threshold + banner text are client config.
- **D-08:** Reconnect/viewers = exponential backoff + jitter on client reconnect + hard cap ~2 concurrent streams — owner-only means 1 normal viewer; rejects extras with a clear message. Pitfall 13-compliant bound on SSE cost. — **Reversibility:** reversible — cap and backoff constants are server config.

### Boards, filters & history

- **D-09:** Board layout = tabbed boards — tabs for Events Local/Travel/Online, TBA queue, Jobs Sys vs General, Loot, and audit & rejection log; one board visible at a time with filters scoped to the active tab. Keeps the page light and the three-panel structure readable. — **Reversibility:** reversible — switching to a stacked page later is a DOM/layout change.
- **D-10:** Filters = rich combined filters in v1 — date range, bucket/channel, status, prize range, free-text title/organizer search, combined AND. Explicitly exceeds the research SUMMARY's "P3 until volume demands it" note; these were selected as v1 scope so the planner does not trim them. — **Reversibility:** reversible — adding/removing filter dimensions is client+endpoint work.
- **D-11:** Audit & rejection log source = hot PocketBase rows for recent audit verdicts + tombstoned/rejected rows (rolling last N/24h), plus an on-demand "load older" button that queries the Turso tombstone_ledger for deeper history. Turso stays cold/write-only for the dashboard default path, keeping cold reads rare. — **Reversibility:** reversible — promoting Turso to primary source later is an endpoint migration.
- **D-12:** Board window = active/upcoming + last 7 days — boards default to active and upcoming items plus ended/expired items from the last 7 days, combinable with rich filters. Usable window without unbounded growth or slow queries. — **Reversibility:** reversible — window size is a query parameter.

### GC & ops observability

- **D-13:** Purge scope = heavy-text columns only at the 24h-after-end_date / 48h-after-rejection marks — clears `opportunities.description_raw` and `agent_telemetry.detail`; row metadata retained forever so the audit trail and boards stay intact. Matches MEM-05 literally ("retaining tombstones + taste rules"); heavy text is where the bytes actually are. — **Reversibility:** reversible — adding whole-row deletion later is a second purge stage; cannot restore purged text.
- **D-14:** GC schedule = IST midnight with jitter — midnight means the owner's midnight, consistent with the scheduler's `Asia/Kolkata` timezone convention. Idempotent so a failed night is recovered, not corrupted; emits a telemetry event with counts (purged/compacted/errors) and alerts if GC hasn't succeeded in 25h (Pitfall 11 guardrail). — **Reversibility:** reversible — timezone + jitter are cron entries.
- **D-15:** Ops alert destination = new `#🛠-ops-health` Discord channel via `resolveChannel` env-ID-first pattern — carries GC summaries/failures, tunnel up/down, watchdog heartbeats, and VM idle-reclaim alerts. Keeps alert channels clean rather than mixing machine-health noise into `#raw-incoming-feeds`. — **Reversibility:** reversible — channel ID is config.
- **D-16:** Kill-tests / ops hardening proof = scripted drills under `infra/oracle/drills/` (same style as `edge-reject.sh`, `wipe-restore.sh`): kill-cloudflared.sh (assert pipelines keep running + dashboard-only outage + alerts queue/drain on recovery), gc-verify.sh (assert purge on schedule while tombstones + taste rules survive), plus tunnel-restart-recovery check. — **Reversibility:** reversible — scripts are additive drill artifacts.

### the agent's Discretion

- Stream server language/framework (Node app on the VM is natural given the TS monorepo; planner picks)
- SSE snapshot/delta event schema (must carry slots, bucket states, board rows)
- Exact staleness banner threshold and wording
- Exact filter field names + pagination for GET endpoints
- Tab order + active-tab persistence (localStorage vs server)
- TBA queue presentation within its tab
- Health-grid column layout + cell styling
- `dashboard.service` resource limits + restart policy details beyond `restart=always`
- Whether GET endpoints return JSON or a minimal markup the static shell injects

### Folded Todos

None — no todos matched Phase 7 in cross_reference_todos (todo_count 0).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements

- `.planning/ROADMAP.md` §Phase 7 — phase goal ("The owner watches the whole swarm live on a locked read-only dashboard that survives tunnel and VM failures"), requirements DSH-01/DSH-02/DSH-03/DSH-04/MEM-05, success criteria 1–4, UI hint: yes
- `.planning/REQUIREMENTS.md` — DSH-01 (Zero Trust pre-render gate), DSH-02 (rolling agent slots live from PocketBase SSE), DSH-03 (2D pool health grid), DSH-04 (filterable read-only boards via tunnel, zero open inbound ports), MEM-05 (midnight GC purge heavy text 24h after end_date / 48h after rejection, retain tombstones + taste rules)
- `.planning/PROJECT.md` — Constraints (zero cost, Zero Trust owner-only wall rejecting before UI/SSE render, v1 read-only, zero open inbound ports), Context (PocketBase hot + Turso cold, Cloudflare Pages + cloudflared tunnel + Zero Trust, shared Playwright browser, LLM ladder telemetry), Key Decisions carried forward

### Data contracts

- `packages/db-hot/src/schema.ts` — `Opportunity` (`bucket_channel`, `status`, `end_date`, `description_raw` heavy-text column, `audit_summary`, `reminders[]`, `bookmark`), `AgentTelemetry` (`slot`, `provider`, `model`, `step`, `status`, `detail` heavy-text column), `TELEMETRY_RETENTION_MS` + `isTelemetryExpired` predicate in `packages/db-hot/src/telemetry.ts`, `PIPELINES` enum (`events|jobs|loot|local|social`), `OPPORTUNITY_STATUSES`
- `packages/llm/src/bucket.ts` — `BucketState` enum (`READY`, `ACTIVE`, `60s-COOLDOWN`, `DAILY-CAP`), `writeBucketState()` to `agent_telemetry`, per-bucket state for the health grid

### Scheduler + infra

- `packages/scheduler/src/jobs.ts` — `STUB_JOBS` cadence table, `gateway-daily-cap-reset` at UTC midnight + 5m jitter (existing midnight precedent), `noOverlap` single-flight semantics
- `packages/scheduler/src/registry.ts` — single scheduler registry owning every `cron.schedule()` call; GC cron job registers here, never scattered `setInterval`
- `infra/cloudflared/config.yml` — tunnel ingress: dashboard hostname → `http://localhost:3000` (Phase 7 fills the stream-origin hostname), edge gate covered by Access policy
- `infra/cloudflared/cloudflared.service`, `.pocketbase.service`, `.scheduler.service` — systemd unit templates; new `dashboard.service` follows the same pattern
- `infra/cloudflared/pocketbase.service` — PB localhost-only, never binds 0.0.0.0
- `infra/oracle/drills/` — `edge-reject.sh` (proven unauthenticated UI+SSE rejection), `wipe-restore.sh` (simulated VM wipe drill), `browser-soak.sh`, `port-scan.sh`, `secrets-scan.sh`; Phase 7 adds kill-cloudflared.sh / gc-verify.sh / tunnel-restart-recovery.sh

### Prior phase decisions (carry forward, respected)

- `.planning/phases/01-foundation/01-CONTEXT.md` — D-13 (realtime-ready `eventsource` polyfill + `AsyncAuthStore`), D-15/D-20 (GC-ready columns + edge-reject test), D-17/D-18/D-19/D-21/D-22 (locked shell behind Zero Trust, zero inbound ports, cloudflared supervised, static shell now, live SSE/boards Phase 7), D-24 (kelektiv/node-cron noOverlap + jitter, Asia/Kolkata), D-25 (2.5GB RAM reclaim defense), D-26 (rebuild runbook)
- `.planning/phases/03-llm-swarm/03-CONTEXT.md` — D-01..D-04 (bucket-state persistence via `agent_telemetry`, vendor-SDK 429/413 detection, length-stitch, Cerebras disabled) — health grid data source
- `.planning/phases/05-jobs-loot-pipelines/05-CONTEXT.md` — D-09..D-11 (fuzzy merger pre-audit stage), D-14 (one-way schema migration pattern), `resolveChannel` env-ID-first channel resolution for new bucket channels
- `.planning/phases/06-delivery-local-social-coverage/06-CONTEXT.md` — D-03 (bio-link page poll reuses `packages/browser` singleton + tab queue), D-05 (bookmark emoji), D-06 (reminder anchor + `reminders[]` shape), D-10 (TBA re-audit via audit-drain), D-12 (taste rule application hybrid), D-13 (taste BLOCK precedence over soft gates but not hard compliance gates)

### Research (still authoritative)

- `.planning/research/ARCHITECTURE.md` — SSE dashboard section (read-only over PB SSE, Zero Trust covers SSE too), Link-Hopper resolves to official/ATS, Deep-Auditor + Chief Curator apply rule packs, dashboard as Egress layer item
- `.planning/research/PITFALLS.md` — Pitfall 11 (tombstone growth + midnight GC failures; GC observability with counts + 25h no-success alarm), Pitfall 13 (SSE fan-out + tunnel disconnects; single shared event bus, viewer caps, tunnel death = dashboard-only outage), Pitfall 14 (secret leakage)
- `.planning/research/SUMMARY.md` — locked read-only dashboard (Zero Trust + opportunity board + audit/rejection log), SSE telemetry slots + 2D pool-health grid instrumented during pipeline build, dashboard search/filters marked P3 until volume demands it (overridden by D-10)

### Stack/runtime

- AGENTS.md (project root) — Technology Stack + Constraints sections

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `apps/dashboard/index.html` — static Phase 1 shell behind Zero Trust; Phase 7 layers live panels onto this same static surface (framework-free per D-02)
- `packages/db-hot/src/telemetry.ts` — `isTelemetryExpired()` predicate + `TELEMETRY_RETENTION_MS` ready for the midnight GC to call; telemetry ring trim contract already defined
- `packages/db-hot/src/schema.ts` — heavy-text columns (`description_raw`, `detail`) already present as GC purge targets; `end_date`, `status`, `bookmark`, `reminders[]` indexes exist for board queries
- `packages/llm/src/bucket.ts` + `packages/llm/src/telemetry.ts` — bucket-state registry + `writeBucketState` stream already feeding `agent_telemetry`; health grid reads this state, no new telemetry instrumentation required
- `packages/browser/src/index.ts` — shared Playwright singleton + tab queue (reused by Phase 6 bio-link poller; available if Phase 7 ever needs a headed probe)
- `packages/scheduler/src/registry.ts` + `jobs.ts` — single-flight cron registry with `noOverlap` + jitter + `Asia/Kolkata`; GC job registers here
- `packages/discord-router/src/router-service.ts` + `embed.ts` — `resolveChannel` env-ID-first + name fallback; `buildAuditCard` field approach; new `#🛠-ops-health` channel resolves via the same pattern

### Established Patterns

- Single scheduler registry owns every `cron.schedule()` call — no `setInterval` anywhere (Phase 1 D-24)
- `resolveChannel` env-ID-first + exact-name fallback for channel IDs — new ops-health channel and board channel names follow this contract
- `zod` `.parse()` at every boundary; fail-fast `parseEnv` env gate first in every entrypoint (Phase 1)
- PB hot (writers) + Turso cold (tombstones/taste) split; bucket telemetry via `agent_telemetry`; SSE realtime via PB JS SDK + `eventsource` polyfill (Phase 1 D-13)
- Drill scripts under `infra/oracle/drills/` prove kill-tests; `edge-reject.sh` already proves unauthenticated UI+SSE rejection before render

### Integration Points

- New SSE-proxy + boards-API server at VM `localhost:3000`, reached via `infra/cloudflared/config.yml` tunnel route (dashboard hostname) — owned by new `dashboard.service` systemd unit
- `packages/scheduler/src/registry.ts` — register GC cron (IST midnight + jitter) alongside existing portal/jobs/loot/gateway-daily-cap-reset jobs
- `packages/config/src/env.ts` — new env keys for ops-health channel ID, stream server bind address, SSE viewer cap, staleness threshold (all via fail-fast `parseEnv`)
- `packages/db-cold/` — `tombstone_ledger` + `taste_rules` permanent store; dashboard audit-log "load older" queries Turso here
- Zero Trust edge gate — unauthenticated UI/SSE requests rejected before anything renders (Phase 1 D-20, proven by `edge-reject.sh`); covers both Pages UI hostname and tunnel stream hostname

</code_context>

<specifics>
## Specific Ideas

- TBA Ping #1 → `#⏳-early-tba-radar` with `WATCHING_TBA` status; Ping #2 fires when prize/date confirmed or event date passes (carried from Phase 6 D-10; visible on the TBA queue board tab)
- `#🛠-ops-health` channel receives GC summary counts, tunnel up/down transitions, and watchdog heartbeats so ops health is visible alongside alert channels
- Audit-card embed already renders `tba` flag, prize breakdown, audit summary — boards reuse this field set
- No specific UX requirements beyond the four discussed areas; open to standard approaches within Phase 7 scope and Phase 1–6 contracts

</specifics>

<deferred>
## Deferred Ideas

- Single-origin dashboard (serve static UI + API + SSE entirely from the VM through the tunnel) — considered and rejected in favor of Pages + VM stream origin (D-01); retains the D-17 "no shortcut" guarantee and graceful tunnel-death behavior
- Rich combined filters were initially flagged in research as "P3 until volume demands it" — explicitly promoted to v1 scope by D-10 so the planner does not trim them
- Dashboard search/faceting beyond combined filters — belongs to a future phase if volume demands it
- Manual dashboard mutations — out of scope per PROJECT.md "Out of Scope" (v1 read-only keeps audit trail single-writer)
- Mobile-responsive dashboard layout — out of scope (dashboard is an owner telemetry view, not an alert-routing surface)
- Dashboard-managed cookie rotation / secret management — out of scope; cookie rotation remains an owner-run script

</deferred>

---

*Phase: 07-Telemetry Dashboard + Ops Hardening*
*Context gathered: 2026-10-17*
