# Phase 07: Telemetry Dashboard + Ops Hardening - Research

**Researched:** 2026-10-17
**Domain:** Read-only SSE telemetry dashboard + midnight GC + kill-test ops hardening
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Cloudflare Pages static UI + VM stream origin (localhost:3000) via tunnel; never single-origin
- D-02: Framework-free static UI — vanilla JS + EventSource + hand-rolled DOM on apps/dashboard/index.html; no build step, no npm deps
- D-03: Hybrid SSE-live + GET-snapshot — one SSE stream for live slots/health grid/board deltas; GET endpoints for initial snapshot + filters
- D-04: Single Zero Trust Access policy covering both hostnames (owner-email Allow, deny-by-default)
- D-05: Own systemd unit dashboard.service (restart=always) alongside cloudflared/PocketBase/scheduler
- D-06: Coalesced push every ~3–5s; single shared PB realtime subscription; batched snapshots/deltas
- D-07: Heartbeat ~15s + amber staleness banner driven by last-event age threshold
- D-08: Exponential backoff + jitter reconnect + hard cap ~2 concurrent streams
- D-09: Tabbed boards (Events Local/Travel/Online, TBA queue, Jobs Sys vs General, Loot, audit & rejection log)
- D-10: Rich combined filters (date range, bucket/channel, status, prize range, free-text, combined AND) — v1 scope
- D-11: Audit & rejection log = hot PB rows (recent) + on-demand "load older" querying Turso tombstone_ledger
- D-12: Board window = active/upcoming + last 7 days
- D-13: GC purges heavy-text columns only (description_raw, detail) at 24h-after-end_date / 48h-after-rejection; metadata retained
- D-14: GC schedule = IST midnight with jitter; idempotent; telemetry event with counts; alert if GC hasn't succeeded in 25h
- D-15: Ops alerts to new #🛠-ops-health Discord channel via resolveChannel env-ID-first
- D-16: Kill-tests / ops hardening proof = scripted drills (kill-cloudflared.sh, gc-verify.sh, tunnel-restart-recovery.sh)

### the agent's Discretion
- Stream server language/framework (Node app on the VM is natural given the TS monorepo; planner picks)
- SSE snapshot/delta event schema (must carry slots, bucket states, board rows)
- Exact staleness banner threshold and wording
- Exact filter field names + pagination for GET endpoints
- Tab order + active-tab persistence (localStorage vs server)
- TBA queue presentation within its tab
- Health-grid column layout + cell styling
- dashboard.service resource limits + restart policy details beyond restart=always
- Whether GET endpoints return JSON or a minimal markup the static shell injects

### Deferred Ideas (OUT OF SCOPE)
- Single-origin dashboard (serve static UI + API + SSE entirely from the VM through the tunnel) — rejected (D-01)
- Dashboard search/faceting beyond combined filters — future phase if volume demands
- Manual dashboard mutations — out of scope per PROJECT.md (v1 read-only)
- Mobile-responsive dashboard layout — out of scope
- Dashboard-managed cookie rotation / secret management — out of scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DSH-01 | Cloudflare Zero Trust gate rejects unauthenticated requests before any UI or SSE stream renders; dashboard is read-only v1 | Security Domain section; edge gate proven by edge-reject.sh drill pattern [VERIFIED: infra/oracle/drills/edge-reject.sh:52-65] |
| DSH-02 | Top panel shows rolling agent slots (provider/model reel + micro-step ticker incl. 429 baton-pass) live from PocketBase SSE | SSE single shared event bus + PB subscribe pattern [CITED: Architecture §Egress Layer] |
| DSH-03 | Middle panel shows 2D pool health grid (READY/ACTIVE/60s-COOLDOWN/DAILY-CAP per provider-model bucket) | BucketState enum [VERIFIED: packages/llm/src/bucket.ts:5-10] |
| DSH-04 | Bottom panel shows filterable read-only boards (Events Local/Travel/Online, TBA queue, Jobs Sys vs General, Loot, live audit & rejection log) served via cloudflared tunnel with zero open inbound ports | Tunnel route localhost:3000 [VERIFIED: infra/cloudflared/config.yml:21-22] |
| MEM-05 | Midnight garbage collector purges heavy text 24h after end_date (48h after rejection), retaining tombstones + taste rules | isTelemetryExpired + TELEMETRY_RETENTION_MS [VERIFIED: packages/db-hot/src/telemetry.ts:8,23-32] |
</phase_requirements>

## Summary

Phase 07 delivers a locked read-only telemetry dashboard that survives tunnel and VM failures, plus an idempotent midnight GC and scripted kill-tests proving ops hardening. The dashboard comprises three panels served from Cloudflare Pages (static, framework-free per D-02) connected through Cloudflare Tunnel to a small Node.js SSE stream server on VM localhost:3000 (D-01, D-05). All traffic passes through a single Cloudflare Zero Trust Access policy covering both the Pages hostname and the tunnel stream hostname (D-04), rejecting unauthenticated requests before anything renders (DSH-01).

Live data flows through a single shared PocketBase realtime subscription on the VM, with coalesced pushes every ~3–5s (D-06), a ~15s heartbeat with amber staleness banner (D-07), and client-side exponential backoff + jitter reconnect capped at ~2 concurrent streams (D-08). The top panel shows rolling agent slots with micro-step ticker including 429 baton-passes (DSH-02); the middle panel shows the 2D pool health grid (READY/ACTIVE/60s-COOLDOWN/DAILY-CAP per provider-model bucket) (DSH-03); the bottom panel shows tabbed, filterable read-only boards via hybrid SSE-live + GET-snapshot (D-03, DSH-04).

MEM-05 is implemented as an idempotent midnight GC (IST + jitter) registered through the single scheduler registry, purging only heavy-text columns (description_raw, detail) at 24h-after-end_date / 48h-after-rejection while retaining tombstones and taste rules (D-13, D-14). GC emits a telemetry event with counts and alerts if it hasn't succeeded in 25h. Kill-tests (kill-cloudflared.sh, gc-verify.sh, tunnel-restart-recovery.sh) live under infra/oracle/drills/ and follow the proven edge-reject.sh drill pattern (D-16).

**Primary recommendation:** Build the stream server as a new workspace app (@zod/dashboard-server) using Node built-in http + existing verified deps (pocketbase JS SDK, eventsource, pino, zod); register GC cron via packages/scheduler/src/registry.ts following the noOverlap + Asia/Kolkata + jitter pattern; add drill scripts mirroring edge-reject.sh structure.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dashboard static UI (vanilla JS + EventSource) | Browser / Client | — | Runs in browser; Cloudflare Pages serves static file; zero build step (D-02) |
| SSE live stream (slots + health grid + board deltas) | API / Backend | Frontend Server (SSR) | Small Node server on VM localhost:3000; single PB subscription fan-out regardless of viewer count (D-06) |
| Board snapshot + filter queries (GET endpoints) | API / Backend | — | VM origin GET endpoints serve initial snapshot + filters (D-03) |
| Board data (opportunities, agent_telemetry) | Database / Storage | — | PocketBase hot store on localhost:8090, loopback-only [VERIFIED: infra/cloudflared/pocketbase.service:20] |
| Historical audit log "load older" | Database / Storage | — | Turso cold store tombstone_ledger, on-demand reads (D-11) |
| Midnight GC purge (heavy-text columns) | API / Backend | Database / Storage | Cron via single scheduler registry; calls isTelemetryExpired [VERIFIED: packages/db-hot/src/telemetry.ts:23-32] |
| Ops alerts (#🛠-ops-health Discord) | API / Backend | — | Discord router resolveChannel env-ID-first (D-15) [VERIFIED: packages/discord-router/src/router-service.ts:149-194] |
| Zero Trust edge gate (UI + SSE) | CDN / Static | API / Backend | Cloudflare Access owner-only Allow + deny-by-default covers both hostnames (D-04) |
| Tunnel ingress (dashboard → localhost:3000) | CDN / Static | — | cloudflared outbound-only; tunnel route maps hostname → http://localhost:3000 [VERIFIED: infra/cloudflared/config.yml:21-22] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js LTS | 22.x (Iron) | Stream server runtime on VM | Native fetch, full discord.js/playwright support; ARM64 LTS [VERIFIED: AGENTS.md stack table] |
| TypeScript | ~5.9 | Single language across monorepo | Strict-mode TS + zod inference [VERIFIED: AGENTS.md stack table] |
| @zod/config | workspace:* | Env schema with parseEnv fail-fast gate | zod .parse() at every boundary; env.parse() first in entrypoint [VERIFIED: packages/config/src/env.ts:49-51] |
| @zod/db-hot | workspace:* | PocketBase client + schemas + isTelemetryExpired | SSE source; telemetry ring; GC purge targets [VERIFIED: packages/db-hot/src/schema.ts, telemetry.ts] |
| @zod/db-cold | workspace:* | Turso client for tombstone_ledger reads | Cold ledger survives VM rebuild; remote-only createClient [VERIFIED: packages/db-cold/src/client.ts:35-40] |
| @zod/logger | workspace:* | Structured JSON logging | pino-based; child loggers per pipeline; telemetry mirror [VERIFIED: AGENTS.md stack table] |
| pocketbase (JS SDK) | ^0.30 | SSE realtime subscription source | Native PB realtime subscriptions; eventsource polyfill required in Node [VERIFIED: AGENTS.md stack table] |
| eventsource | ^3 | EventSource polyfill for PB realtime in Node | global.EventSource assignment before any realtime call [VERIFIED: packages/db-hot/src/client.ts:42-46] |
| pino | ^10 | Structured JSON logging (agent_telemetry mirror) | Fastest Node logger; log levels map 1:1 to agent_telemetry rows [VERIFIED: AGENTS.md stack table] |
| zod | ^4 | Runtime validation at every boundary | TS-first inference; Schema.parse() rejects missing/wrong-typed fields [VERIFIED: AGENTS.md stack table] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | D-02 mandates zero npm deps for dashboard UI | Framework-free static shell; stream server uses Node built-in http + existing workspace deps |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Express/Koa/Fastify for stream server | Node built-in http | Built-in http is sufficient for SSE + GET endpoints; avoids extra dep and surface area |
| Separate PB subscription per viewer | Single shared subscription | Single bus keeps fan-out flat regardless of viewer count (Pitfall 13) |
| Whole-row GC purge | Heavy-text columns only | MEM-05 literally retains tombstones + taste rules; heavy text is where bytes are (D-13) |

**Installation:** No new npm packages required for Phase 7. The dashboard UI has zero deps (D-02). The stream server reuses existing workspace packages (@zod/config, @zod/db-hot, @zod/db-cold, @zod/logger) and Node built-ins (http, EventSource via eventsource polyfill already installed).

**Version verification:** All packages above are already verified in Phase 01 per AGENTS.md/STACK.md (HIGH confidence, Context7-verified). No new packages introduced in Phase 7.

## Package Legitimacy Audit

Phase 7 introduces no new external packages. The dashboard UI is framework-free (D-02: vanilla JS + EventSource, no build step, no npm deps). The stream server uses Node built-in `http` plus existing workspace packages already verified in Phase 01:

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| pocketbase (JS SDK) | npm | ~3 yrs | High | pocketbase/pocketbase | OK | Already verified (Phase 01) |
| eventsource | npm | ~6 yrs | High | happeningsource/eventsource | OK | Already verified (Phase 01) |
| pino | npm | ~9 yrs | High | pinojs/pino | OK | Already verified (Phase 01) |
| zod | npm | ~7 yrs | High | colinhacks/zod | OK | Already verified (Phase 01) |
| @libsql/client | npm | ~2 yrs | High | tursodatabase/turso | OK | Already verified (Phase 01) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

All packages above are workspace dependencies already installed and verified. If the planner elects to add any SSE helper library (e.g., an SSE-specific npm package), it must pass `gsd_run query package-legitimacy check` before installation.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                                │
│  Cloudflare Pages static UI (apps/dashboard/index.html)                      │
│  - Vanilla JS + EventSource + hand-rolled DOM                                │
│  - Zero Trust Access gate blocks unauth before render                        │
│  - SSE client: heartbeat ~15s, amber staleness banner,                       │
│    exponential backoff + jitter reconnect, cap ~2 streams                    │
└──────────────────┬──────────────────────────────────────────────────────────┘
                   │ EventSource (SSE) via Cloudflare Tunnel
                   │ Zero Trust: owner-email Allow, deny-by-default
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLOUDFLARE EDGE                                     │
│  - Zero Trust Access policy (single policy, both hostnames)                  │
│  - cloudflared tunnel: dashboard hostname → http://localhost:3000            │
│  - Zero inbound ports on Oracle VM                                           │
└──────────────────┬──────────────────────────────────────────────────────────┘
                   │ Tunnel (outbound-only)
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      VM STREAM ORIGIN (localhost:3000)                       │
│  dashboard.service (systemd, restart=always)                                 │
│  - Node http server: SSE stream + GET snapshot/filter endpoints              │
│  - Single shared PocketBase realtime subscription (fan-out to all viewers)   │
│  - Coalesced push every ~3–5s; heartbeat ~15s                                │
│  - GET endpoints: initial board snapshot + combined filters                  │
└──────────────────┬──────────────────────────────────────────────────────────┘
                   │ PB realtime subscribe (single shared event bus)
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      POCKETBASE HOT (localhost:8090, loopback-only)         │
│  - opportunities (MEM-01): bucket_channel, status, end_date, description_raw│
│  - agent_telemetry (MEM-02): slot, provider, model, step, status, detail    │
│  - tombstone_ledger (hot mirror), taste_rules                               │
└──────────────────┬──────────────────────────────────────────────────────────┘
                   │ GC midnight purge (IST + jitter)
                   │ reads agent_telemetry.created, expires via isTelemetryExpired
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TURSO COLD (tombstone_ledger + taste_rules)            │
│  - Permanent fingerprints; "load older" audit log reads                      │
│  - Survives VM rebuild                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OPS ALERTS → Discord #🛠-ops-health                     │
│  - resolveChannel env-ID-first (D-15)                                        │
│  - GC summaries/failures, tunnel up/down, watchdog heartbeats                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
apps/dashboard-server/
├── src/
│   ├── index.ts          # Entrypoint: parseEnv → logger → http server
│   ├── sse.ts            # SSE stream: single PB subscription, fan-out, heartbeat
│   ├── boards.ts         # GET endpoints: snapshot + filters (date, channel, status, prize, free-text)
│   ├── gc.ts             # Midnight GC: isTelemetryExpired purge + telemetry event
│   └── alerts.ts         # Discord #🛠-ops-health alerts via resolveChannel
├── package.json          # @zod/dashboard-server, workspace deps only
└── tsconfig.json
infra/cloudflared/
├── dashboard.service     # New systemd unit (restart=always, follows existing template)
infra/oracle/drills/
├── kill-cloudflared.sh   # Assert pipelines keep running + dashboard-only outage
├── gc-verify.sh          # Assert purge on schedule; tombstones + taste rules survive
└── tunnel-restart-recovery.sh  # Assert tunnel recovery + alert drain
```

### Pattern 1: Single Shared PB SSE Event Bus + Coalesced Fan-Out

**What:** The stream server subscribes to PocketBase realtime once (`subscribe("*")` on opportunities + agent_telemetry), batches changes, and pushes coalesced snapshots/deltas to all SSE clients every ~3–5s. One upstream subscription regardless of viewer count keeps fan-out flat (Pitfall 13-compliant).

**When to use:** Live slots, health grid, and board deltas where sub-second latency isn't required (a 3s-old ticker is imperceptible to a human watcher).

**Why standard:** Directly implements Pitfall 13's "bound SSE cost" guidance: single shared event bus, viewer cap, backoff reconnect.

### Pattern 2: Hybrid SSE-Live + GET-Snapshot

**What:** One SSE stream carries live deltas; a small set of GET endpoints on the VM origin serves the initial board snapshot and filter queries. Client connects once, backfills once via GET, then rides the SSE stream.

**When to use:** Read-only boards with rich combined filters (D-10) where initial state needs to be fetched before live updates begin.

**Why standard:** Cleanest GET/stream split; simplest reconnection story (reconnect + replay stays small).

### Pattern 3: Idempotent Midnight GC with Telemetry + 25h Alert

**What:** GC cron job (IST midnight + jitter) registered through the single scheduler registry calls `isTelemetryExpired()` to purge heavy-text columns (description_raw, detail) at 24h-after-end_date / 48h-after-rejection. Emits telemetry event with counts (purged/compacted/errors). Alerts if GC hasn't succeeded in 25h.

**When to use:** MEM-05 compliance — purge heavy text while retaining tombstones + taste rules.

**Why standard:** Matches existing scheduler patterns (noOverlap, Asia/Kolkata timezone, jitter) and Pitfall 11 guardrail (GC observability + 25h no-success alarm).

### Pattern 4: systemd Unit per Service (dashboard.service)

**What:** New `dashboard.service` follows the same template as cloudflared.service, pocketbase.service, scheduler.service — Type=simple, Restart=always, RestartSec=10, User=zod, NoNewPrivileges=true, EnvironmentFile=/etc/zod/env.

**When to use:** Any long-lived VM process that must survive crashes and reboots.

**Why standard:** Consistent with Phase 1 ops model; crash or VM reboot brings the stream server back automatically; keeps tunnel death dashboard-only (Pitfall 13).

### Anti-Patterns to Avoid

- **[Per-viewer PB subscription]:** Opening a separate PocketBase realtime subscription per dashboard viewer multiplies SSE cost and can trigger reconnect storms on tunnel flap. Use single shared event bus instead.
- **[App-level dashboard auth]:** Building custom login/session for the dashboard duplicates Cloudflare Zero Trust. Let Access be the edge gate; unauth dies at the edge (D-04, Pitfall 14).
- **[Scattered setInterval cron]:** Registering GC or any scheduled job outside the single scheduler registry violates D-23/D-24. Use registerPollJobs/registerGatewayJobs pattern.
- **[Whole-row GC deletion]:** Deleting entire opportunity/telemetry rows destroys the audit trail. MEM-05 retains tombstones + taste rules; purge heavy-text columns only (D-13).
- **[Dashboard write path]:** Adding approve/reject buttons that mutate opportunities breaks the single-writer audit trail. v1 stays strictly read-only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE fan-out per viewer | Custom per-viewer PB subscription + reconnect logic | Single shared PB subscription + broadcast to all SSE clients | Flat fan-out cost; no reconnect storm (Pitfall 13) |
| Dashboard authentication | Custom login/session/cookie management | Cloudflare Zero Trust Access (owner-email Allow, deny-by-default) | Edge gate before UI/SSE render; no app-auth code (D-04) |
| Scheduled GC cron | setInterval or ad-hoc cron | Single scheduler registry (kelektiv/node-cron, noOverlap, Asia/Kolkata, jitter) | Single-flight; overlap skips warned; consistent with all other jobs |
| GC purge scope | Whole-row deletion of expired opportunities | Heavy-text columns only (description_raw, detail) | MEM-05 retains tombstones + taste rules; heavy text is where bytes are |
| Secret handling | Hardcoding Discord/webhook tokens in stream server | resolveChannel env-ID-first; env-only secrets via parseEnv fail-fast | Pitfall 14: secrets only from environment, never in code |

**Key insight:** Every deceptively complex problem in this phase (SSE fan-out, auth, scheduling, secret handling) already has a project-standard solution. Building custom substitutes reintroduces pitfalls that earlier phases were designed to eliminate.

## Common Pitfalls

### Pitfall 11: Tombstone Growth + Midnight GC Failures

**What goes wrong:** Every rejected/expired/merged item writes a permanent fingerprint to Turso's tombstone_ledger. At 24/7 poll rates, this grows unboundedly toward the 5GB free cap. If midnight GC fails silently (tunnel down, cron overlap), hot PocketBase fills with expired items that get re-alerted, and tombstones never compact. Turso returns `BLOCKED` on any exceeded metric (overages off), halting ALL cold writes.

**Why it happens:** "Permanent fingerprints" specified without a size bound or index plan. SQLite `VACUUM` is disabled on Turso, so storage never compacts itself. GC is an unwatched cron job.

**How to avoid:**
- Fingerprint minimalism: 32-byte hash + tiny metadata (source, date, reason code), never full page text.
- Index the dedup lookup path (url_hash primary key — point lookups, never scans).
- GC observability: midnight purge emits telemetry event with counts (purged/compacted/errors); alert if GC hasn't succeeded in 25h (D-14).
- Make GC idempotent so a failed night is recovered, not corrupted.
- Monitor Turso rows-read/written against quota with a weekly burn-rate gauge.

**Warning signs:** Turso usage climbing faster than alert volume; dedup latency growing week-over-week; `BLOCKED` errors; GC success telemetry missing.

**Verification:** gc-verify.sh drill asserts purge on schedule while tombstones + taste rules survive.

### Pitfall 13: SSE Fan-Out + Tunnel Disconnects

**What goes wrong (two faces):**
- **Fan-out load:** Rolling agent slots over PB SSE seem cheap until reconnect storms (tunnel flap → all clients reconnect → full state replays) or the owner leaves the dashboard open in multiple tabs. Each SSE stream costs memory; unbounded streams on a box defending reclaim margins is real load.
- **Tunnel disconnects:** cloudflared drops (network flap, process death, Oracle maintenance). The dashboard goes dark. Tunnel death must be a dashboard-only outage, never a pipeline outage — pipelines must have zero runtime dependency on the tunnel, dashboard, or Discord availability.

**Why it happens:** SSE is "just an HTTP response" in dev; in production it's a stateful connection per viewer with replay semantics. Tunnels treated as set-and-forget.

**How to avoid:**
- Zero Trust gate BEFORE any SSE/data render (D-04) — unauthenticated reconnect loops die at the edge, not in PocketBase.
- Bound SSE cost: single shared event bus on the VM, one upstream PB subscription regardless of viewer count; cap concurrent dashboard viewers (~2, D-08); heartbeat + exponential-backoff reconnect on client.
- Supervise cloudflared (systemd Restart=always); health monitoring distinguishes "tunnel down, pipelines fine" (dashboard-only, low urgency) from "VM down" (P0).
- Pipelines continue and alerts queue durably when Discord is unreachable; drain on recovery.

**Warning signs:** SSE connection count >> open tabs; memory spikes correlated with dashboard opens; "dashboard dark but Discord alerts still arriving" (tunnel-only failure); cloudflared restart loops.

**Verification:** kill-cloudflared.sh drill asserts pipelines keep running + dashboard-only outage + alerts queue/drain on recovery; tunnel-restart-recovery.sh asserts recovery.

### Pitfall 14: Secret Leakage

**What goes wrong:** Discord bot token, X/LinkedIn burner cookies, Cloudflare credentials, Turso auth tokens, LLM API keys end up in git, debug logs, error reports, or clipboard. A leaked Discord bot token lets anyone impersonate the alert system across all 10 channels.

**Why it happens:** Greenfield speed: `.env` checked in "temporarily," verbose HTTP logging, cookies copied through chat, one shared `.env` for all providers.

**How to avoid:**
- Secrets ONLY from environment (or local-only secret file 0600, gitignored from day one). `.env.example` with placeholders committed; real `.env` never.
- Redacting logger: single HTTP/log helper strips `Authorization`, `Cookie`, `token`, `key` fields. No raw header dumps; grep-verify in CI.
- Stream server reads secrets via parseEnv fail-fast gate (D-06 area); env.ID-first channel resolution (D-15).
- Separate keys per provider with minimal scope; document revocation procedure per secret in runbook.

**Warning signs:** Secrets in `git log`/`git diff`; tokens visible in telemetry/logs; cookie age unknown.

**Verification:** secrets-scan.sh drill; secrets only via env (never code).

## Code Examples

### SSE Server Stream Endpoint (Node built-in http)

```typescript
// Source: project pattern — dashboard.service stream server at VM localhost:3000
import { createServer } from 'node:http';
import { EventSource } from 'eventsource';
import PocketBase from 'pocketbase';
import { parseEnv } from '@zod/config';
import { createLogger } from '@zod/logger';
import { isTelemetryExpired, TELEMETRY_RETENTION_MS } from '@zod/db-hot/telemetry';

const env = parseEnv();
const log = createLogger(env.LOG_LEVEL);
const pb = await createPbClient(env);

// Single shared PB realtime subscription (fan-out to all SSE viewers)
const clients = new Set<ReturnType<typeof createServer>['__sse_clients']>();
let lastEventAge = Date.now();

pb.collection('agent_telemetry').subscribe('*', (e) => {
  lastEventAge = Date.now();
  // Coalesce into next ~3-5s push batch (D-06)
});

const server = createServer((req, res) => {
  if (req.url === '/api/stream') {
    // Zero Trust already rejected unauth at Cloudflare edge (D-04)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    clients.add(res);
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    req.on('close', () => clients.delete(res));
  } else if (req.url?.startsWith('/api/boards')) {
    // GET snapshot + filters (D-03, D-10)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ boards: [] }));
  }
});

server.listen(3000, '127.0.0.1');
// Coalesced push every ~3-5s (D-06)
setInterval(() => {
  const snapshot = JSON.stringify({ type: 'delta', ts: Date.now() });
  for (const client of clients) {
    client.write(`data: ${snapshot}\n\n`);
  }
}, 4000);

// Heartbeat ~15s + staleness detection (D-07)
setInterval(() => {
  const age = Date.now() - lastEventAge;
  if (age > 90_000) { // amber banner threshold — discretion
    // push staleness banner to all clients
  }
}, 15_000);
```

> Note: The `setInterval` here is internal to the stream server's SSE push cadence (an internal server constant, D-06), not a scheduled job. All scheduled cron jobs (GC, etc.) go through the single scheduler registry — no scattered setInterval for pipeline schedules.

### GC Job Registration via Scheduler Registry

```typescript
// Source: follows packages/scheduler/src/registry.ts pattern (noOverlap, Asia/Kolkata, jitter)
import { registerPollJobs, type StubJobDef } from '@zod/scheduler-registry';

const GC_JOB: StubJobDef = {
  name: 'gc-midnight-purge',
  expression: '0 0 * * *',          // IST midnight via SCHEDULER_TIMEZONE
  maxRandomDelayMs: 15 * 60_000,     // jitter — discretion
  description: 'Midnight GC: purge heavy-text columns; retain tombstones + taste rules',
};

// Register via registerPollJobs with injected tickHandler that calls isTelemetryExpired
```

### Client EventSource Reconnect with Backoff

```typescript
// Source: apps/dashboard/index.html vanilla JS (D-02 — no npm deps)
function connectEventSource(url: string) {
  let backoff = 1000;
  const maxBackoff = 30_000;
  let reconnects = 0;
  const MAX_STREAMS = 2; // D-08 hard cap

  const es = new EventSource(url);
  let lastEvent = Date.now();

  es.onmessage = (e) => {
    lastEvent = Date.now();
    backoff = 1000; // reset on successful message
  };

  es.onerror = () => {
    es.close();
    reconnects++;
    if (reconnects > MAX_STREAMS) {
      showError('Stream limit reached');
      return;
    }
    setTimeout(() => connectEventSource(url), backoff + Math.random() * 1000);
    backoff = Math.min(backoff * 2, maxBackoff);
  };

  // Heartbeat ~15s + amber staleness banner (D-07)
  setInterval(() => {
    if (Date.now() - lastEvent > 90_000) showStalenessBanner();
  }, 15_000);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| Dashboard search/filters marked P3 (SUMMARY.md) | Rich combined filters in v1 (D-10) | Phase 7 context (D-10 overrides SUMMARY) | Filters are v1 scope, not deferred |
| Single-origin dashboard (rejected) | Cloudflare Pages + VM stream origin via tunnel (D-01) | Phase 7 context | Graceful tunnel-death behavior; dashboard-only outage |
| No GC alerting | GC telemetry + 25h-missing alert (D-14) | Phase 7 context | GC failures visible before 25h silence |

**Deprecated/outdated:**
- Original `node-cron` (unmaintained, no noOverlap/jitter): replaced by `kelektiv/node-cron ^4` — already established in Phase 1
- Serving dashboard from VM origin (single-origin): rejected in favor of Pages + tunnel (D-01); preserves D-17 "no shortcut" guarantee

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Stream server implemented as Node.js app (not another language) | Architecture Patterns | Rework if planner chooses different runtime |
| A2 | SSE event schema carries slots, bucket states, board rows (exact field names TBD) | Architecture Patterns | Client/server contract mismatch |
| A3 | Staleness banner threshold ~90s (6 heartbeat misses) | Code Examples | Banner too sensitive or too lax — tunable constant |
| A4 | GET endpoints return JSON (not minimal markup) | Standard Stack / Code Examples | Client injection logic differs |
| A5 | Tab order + active-tab persistence via localStorage | Architectural Responsibility Map | UX inconsistency across sessions |
| A6 | dashboard.service resource limits follow existing unit templates (no custom limits) | Infrastructure Plan | OOM or CPU starvation under load |
| A7 | No new npm packages needed beyond existing verified stack | Package Legitimacy Audit | If SSE helper needed, must pass legitimacy check first |

All assumptions are discretion items from CONTEXT.md and require planner confirmation before becoming locked decisions.

## Open Questions (RESOLVED)

1. **SSE event schema field names** — RESOLVED
   - What we know: Schema must carry slots, bucket states (READY/ACTIVE/60s-COOLDOWN/DAILY-CAP), board rows (DSH-02, DSH-03)
   - Decision: Plan 01 Task 1 defines the SSE delta schema as `{type, ts, slots[], bucketStates[], boardDeltas[]}`; GET /api/boards returns `{boards: [...]}`. Documented as the stream-server→dashboard contract (Plan 01 Task 1 acceptance criteria).
   - Recommendation: Planner decides; document as contract between stream server and dashboard UI

2. **Staleness banner threshold** — RESOLVED
   - What we know: Heartbeat ~15s (D-07); amber banner driven by last-event age threshold (D-07)
   - Decision: ~90s = 6 missed heartbeats, client config constant `STALENESS_THRESHOLD_MS` in packages/config/src/env.ts (Plan 03 Task 2). Tunable client config; start with ~90s.
   - Recommendation: Tunable client config; start with ~90s

3. **GET endpoint response format** — RESOLVED
   - What we know: GET endpoints serve initial board snapshot + filter queries (D-03)
   - Decision: JSON response (`application/json`) from GET /api/boards; static shell injects via DOM (Plan 01 Task 1 acceptance criteria). JSON is simpler; static shell injects via DOM.
   - Recommendation: JSON is simpler; static shell injects via DOM

4. **Tab order + active-tab persistence** — RESOLVED
   - What we know: Tabbed boards (D-09); one board visible at a time
   - Decision: localStorage for active-tab persistence (Plan 02 Task 1 action). Client-only persistence via localStorage.
   - Recommendation: localStorage for client-only persistence

5. **dashboard.service resource limits** — RESOLVED
   - What we know: restart=always (D-05); follows existing unit template
   - Decision: Existing template defaults — `RestartSec=10`, `NoNewPrivileges=true`, mirroring `scheduler.service` template (Plan 01 Task 1 action). Memory/CPU limits beyond RestartSec=10, NoNewPrivileges start from template defaults; monitor RSS.
   - Recommendation: Start with existing template defaults; monitor RSS

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 LTS | Stream server runtime | ✓ | 22.x | — |
| PocketBase | SSE source + board data (localhost:8090) | ✓ | v0.35.x | — |
| Turso | Cold audit log "load older" reads | ✓ | remote | — |
| cloudflared | Tunnel ingress (dashboard → localhost:3000) | ✓ | latest 2026.x | — |
| Discord Gateway | Ops alerts (#🛠-ops-health) | ✓ | v14 | Alerts queue/drain on recovery |
| `eventsource` polyfill | PB realtime in Node stream server | ✓ | ^3 | — |
| Zero Trust Access | Edge gate for UI + SSE | ✓ | Cloudflare | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

All external dependencies are already provisioned from Phase 1 (Oracle VM, PocketBase, Turso, cloudflared, Zero Trust, Discord).

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` (line 24), so this section is included. `security_enforcement` is `true` (line 48), so Security Domain is included below.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^3 [VERIFIED: AGENTS.md stack table] |
| Config file | vitest.config.ts (per-package, e.g. packages/db-cold/vitest.config.ts) |
| Quick run command | `pnpm vitest run` (per-package) |
| Full suite command | `pnpm test` (workspace root, all packages) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| DSH-01 | Zero Trust rejects unauth UI + SSE before render | Integration (drill) | `infra/oracle/drills/edge-reject.sh --local` | ✅ exists |
| DSH-02 | Rolling agent slots live from PB SSE | Unit (stream server) | `pnpm vitest run apps/dashboard-server/src/sse.test.ts` | ❌ Wave 0 |
| DSH-03 | 2D pool health grid (READY/ACTIVE/60s-COOLDOWN/DAILY-CAP) | Unit (bucket states) | `pnpm vitest run packages/llm/src/bucket.test.ts` | ❌ Wave 0 |
| DSH-04 | Filterable read-only boards via tunnel | Integration (drill + e2e) | `infra/oracle/drills/tunnel-restart-recovery.sh` | ❌ Wave 0 |
| MEM-05 | Midnight GC purges heavy text; retains tombstones | Unit + drill | `pnpm vitest run packages/db-hot/src/telemetry.test.ts` + `infra/oracle/drills/gc-verify.sh` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm vitest run` (affected package only, <30s)
- **Per wave merge:** `pnpm test` (full workspace suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/dashboard-server/src/sse.test.ts` — covers DSH-02 (SSE stream + fan-out)
- [ ] `apps/dashboard-server/src/boards.test.ts` — covers DSH-04 (GET snapshot + filters)
- [ ] `apps/dashboard-server/src/gc.test.ts` — covers MEM-05 (isTelemetryExpired purge logic)
- [ ] `infra/oracle/drills/kill-cloudflared.sh` — covers DSH-01/D-08 (tunnel death = dashboard-only)
- [ ] `infra/oracle/drills/gc-verify.sh` — covers MEM-05/D-14 (GC on schedule + tombstones survive)
- [ ] `infra/oracle/drills/tunnel-restart-recovery.sh` — covers DSH-04/D-08 (tunnel recovery)
- [ ] Framework install: none (zero new npm deps per D-02)

## Security Domain

> `security_enforcement` is `true` in `.planning/config.json` (line 48), so this section is included. ASVS Level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Threat modeling; Zero Trust edge gate (D-04) |
| V2 Authentication | yes | Cloudflare Zero Trust owner-email Allow; no app-auth code |
| V3 Session Management | no | No sessions; read-only dashboard; stateless SSE |
| V4 Access Control | yes | Deny-by-default Access policy; read-only v1 (no mutations) |
| V5 Input Validation | yes | zod Schema.parse() at all boundaries; GET filter param validation |
| V6 Cryptography | no | No custom crypto; TLS via Cloudflare edge |
| V7 Error Handling | yes | No secret leakage in errors; redacting logger |
| V13 Client Communication | yes | Zero Trust covers SSE; EventSource over tunnel |

### Known Threat Patterns for Node.js + SSE + Zero Trust Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated SSE access | Spoofing / Information Disclosure | Cloudflare Zero Trust Access denies at edge before stream connects (D-04) |
| SSE reconnect storm | Denial of Service | Single shared PB subscription; viewer cap ~2; exponential backoff + jitter (D-08, Pitfall 13) |
| Secret leakage in logs | Information Disclosure | Redacting logger strips Authorization/Cookie/token/key; env-only secrets (Pitfall 14) |
| Tunnel disconnect → pipeline halt | Denial of Service | Pipelines tunnel-independent; alerts queue/drain (Pitfall 13) |
| GC silent failure | Denial of Service | GC telemetry event + 25h-missing alert; idempotent re-run (D-14, Pitfall 11) |
| Dashboard dark = VM down confusion | Spoofing (misleading state) | Dual-heartbeat monitoring distinguishes tunnel down vs VM down (Pitfall 13) |

## Sources

### Primary (HIGH confidence)
- `packages/db-hot/src/schema.ts` — PIPELINES enum, OPPORTUNITY_STATUSES, TELEMETRY_STATUSES, Opportunity/AgentTelemetry schemas, INDEX_NOTES (read this session)
- `packages/db-hot/src/telemetry.ts` — TELEMETRY_RETENTION_MS, isTelemetryExpired() (read this session)
- `packages/llm/src/bucket.ts` — BucketState enum (read this session)
- `packages/scheduler/src/jobs.ts` — STUB_JOBS, GATEWAY_JOBS, SCHEDULER_TIMEZONE, RECLAIM_FLOOR/CEILING (read this session)
- `packages/scheduler/src/registry.ts` — single registry, assertSchedulerGuards, noOverlap pattern (read this session)
- `packages/config/src/env.ts` — EnvSchema, parseEnv fail-fast gate (read this session)
- `packages/db-cold/src/client.ts` — createTursoClient, RECORD_TOMBSTONE_SQL INSERT OR IGNORE (read this session)
- `packages/discord-router/src/router-service.ts` — resolveChannel env-ID-first, CHANNEL_ID_ENV_KEYS (read this session)
- `infra/cloudflared/config.yml` — tunnel route dashboard → localhost:3000 (read this session)
- `infra/cloudflared/cloudflared.service` — ExecStart, Restart=always (read this session)
- `infra/cloudflared/pocketbase.service` — loopback-only 127.0.0.1:8090 (read this session)
- `infra/cloudflared/scheduler.service` — systemd unit template pattern (read this session)
- `apps/dashboard/index.html` — static Phase 1 shell, no live-data wiring (read this session)
- `infra/oracle/drills/edge-reject.sh` — drill pattern: local config-lint + live reject-before-render (read this session)
- `AGENTS.md` — Technology Stack + Constraints (read this session)
- `.planning/REQUIREMENTS.md` — DSH-01..04, MEM-05 (read this session)
- `.planning/phases/07-telemetry-dashboard-ops-hardening/07-CONTEXT.md` — D-01..D-16 locked decisions (read this session)
- `.planning/research/ARCHITECTURE.md` — SSE dashboard section, egress layer (read this session)
- `.planning/research/PITFALLS.md` — Pitfall 11, 13, 14 (read this session)
- `.planning/research/SUMMARY.md` — locked read-only dashboard, SSE telemetry slots + health grid (read this session)
- `.planning/config.json` — nyquist_validation=true, security_enforcement=true (read this session)

### Secondary (MEDIUM confidence)
- Context7 `/pocketbase/js-sdk` — SDK install, EventSource polyfill, realtime subscribe (referenced in STACK.md)
- Context7 `/tursodatabase/turso-docs` — @libsql/client remote patterns (referenced in STACK.md)
- Context7 `/kelektiv/node-cron` — noOverlap, jitter/maxRandomDelay (referenced in STACK.md)

### Tertiary (LOW confidence)
- Cloudflare Tunnel outbound-only + Zero Trust model — referenced in ARCHITECTURE.md as single source; re-verify flags during infra phase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in Phase 01 via Context7 + AGENTS.md; no new packages introduced
- Architecture: HIGH — all patterns follow established project conventions; locked decisions D-01..D-16 constrain scope
- Pitfalls: HIGH — Pitfall 11/13/14 verified against official docs (Oracle reclaim, Turso quotas, Discord self-bot) in PITFALLS.md
- Code examples: MEDIUM — SSE server skeleton follows project patterns but exact schema field names are discretion items

**Research date:** 2026-10-17
**Valid until:** 30 days (stable phase domain)