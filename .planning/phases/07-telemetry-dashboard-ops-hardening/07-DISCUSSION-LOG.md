# Phase 7: Telemetry Dashboard + Ops Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-17
**Phase:** 7-Telemetry Dashboard + Ops Hardening
**Areas discussed:** Hosting & data path, Live updates & failure surfacing, Boards filters & history, GC & ops observability

---

## Hosting & data path

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Pages + VM stream origin | Cloudflare Pages hosts static UI; tunnel routes to small SSE-proxy + boards-API on VM localhost:3000; matches D-17 no-shortcut note | ✓ |
| Single origin: everything from VM | Retire Pages; serve UI + API + SSE all from localhost:3000 through tunnel | |
| You decide | Researcher/planner picks topology | |

**User's choice:** Keep Pages + VM stream origin (Recommended)
**Notes:** Pages UI stays loadable when tunnel dies; stream origin fills the config.yml placeholder route.

| Option | Description | Selected |
|--------|-------------|----------|
| Framework-free static | Vanilla JS + EventSource on existing static shell; no build step | ✓ |
| Light framework + Vite build | Vite + Preact/Svelte with build step on Pages | |
| You decide | Planner picks based on interactivity load | |

**User's choice:** Framework-free static (Recommended)
**Notes:** Three panels + filters well within vanilla reach; keeps Pages deploy as straight file upload.

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: SSE live + GET snapshot | One SSE stream for live slots/grid/deltas; GET endpoints for snapshot + filters | ✓ |
| Push-only, no REST | Everything on SSE with full state replay on connect | |
| You decide | Planner picks based on PB realtime capabilities | |

**User's choice:** Hybrid: SSE live + GET snapshot (Recommended)
**Notes:** Simplest reconnection story; connect once, backfill once, ride the stream.

| Option | Description | Selected |
|--------|-------------|----------|
| Single policy, both hostnames | One Access policy (owner-email Allow, deny-by-default) covers Pages + tunnel stream | ✓ |
| Separate policies per origin | Separate Access applications per hostname | |
| You decide | Planner decides based on edge-reject.sh verification | |

**User's choice:** Single policy, both hostnames (Recommended)
**Notes:** Same deny-by-default, zero-bypass shape proven by drills/edge-reject.sh.

| Option | Description | Selected |
|--------|-------------|----------|
| Own systemd unit | dashboard.service restart=always alongside cloudflared/PocketBase/scheduler | ✓ |
| Fold into existing process | Run stream server inside scheduler or another process | |
| You decide | Planner decides based on process/memory budget | |

**User's choice:** Own systemd unit (Recommended)
**Notes:** Consistent with Phase 1 ops model; keeps tunnel death dashboard-only.

---

## Live updates & failure surfacing

| Option | Description | Selected |
|--------|-------------|----------|
| Coalesced push every ~3–5s | Server subscribes once to PB realtime, batches changes, pushes coalesced snapshots/deltas | ✓ |
| Per-row immediate push | Every telemetry row change forwarded immediately | |
| You decide | Planner picks based on measured write volume | |

**User's choice:** Coalesced push every ~3–5s (Recommended)
**Notes:** Implements Pitfall 13 "bound SSE cost" guidance; flat fan-out regardless of viewer count.

| Option | Description | Selected |
|--------|-------------|----------|
| Staleness banner + heartbeat | ~15s heartbeat; amber banner on last-event-age threshold | ✓ |
| Connection dot only | EventSource-driven live/reconnecting dot | |
| Full-page dark overlay | Full-screen takeover hiding last-known data | |
| You decide | Planner designs failure UX | |

**User's choice:** Staleness banner + heartbeat (Recommended)
**Notes:** UI keeps loading because Pages-hosted; graceful tunnel-death failure mode.

| Option | Description | Selected |
|--------|-------------|----------|
| Backoff jitter + ~2-viewer cap | Exponential backoff + jitter reconnect; hard cap ~2 concurrent streams | ✓ |
| Browser auto-reconnect, no cap | EventSource built-in reconnect only | |
| You decide | Planner sizes cap/backoff from measured behavior | |

**User's choice:** Backoff jitter + ~2-viewer cap (Recommended)
**Notes:** Owner-only means 1 normal viewer; rejects extras with clear message.

---

## Boards, filters & history

| Option | Description | Selected |
|--------|-------------|----------|
| Tabbed boards | Tabs for Events/Local/Travel/Online, TBA, Jobs Sys vs General, Loot, audit & rejection log | ✓ |
| Single scrolling page | All boards stacked with sticky filter bar | |
| You decide | Planner picks layout after board content analysis | |

**User's choice:** Tabbed boards (Recommended)
**Notes:** Keeps page light; filters scoped to active tab.

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: tab + status + text search | Board tab + status dropdown + free-text search | |
| Rich: full combined filters | Date range, bucket/channel, status, prize range, free text, combined AND | ✓ |
| Tabs only, no filters | Tabs partition by pipeline; no additional filters | |
| You decide | Planner picks filter set | |

**User's choice:** Rich: full combined filters (Recommended)
**Notes:** Explicitly exceeds research SUMMARY's "P3 until volume demands it" note; promoted to v1 scope so planner does not trim.

| Option | Description | Selected |
|--------|-------------|----------|
| Hot PB rows only, rolling recent | PocketBase audit + tombstone rows rolling last N/24h | |
| Hot recent + on-demand cold history | Hot recent + "load older" querying Turso tombstone_ledger | ✓ |
| Cold ledger as primary | Query Turso tombstone_ledger directly for full history | |
| You decide | Planner designs log data source/depth | |

**User's choice:** Hot recent + on-demand cold history (Recommended)
**Notes:** Turso stays cold/write-only default; keeps cold reads rare.

| Option | Description | Selected |
|--------|-------------|----------|
| Active/upcoming + last 7 days | Active/upcoming plus ended/expired items from last 7 days | ✓ |
| Everything still in hot DB | All remaining rows (grows unbounded) | |
| Active/upcoming only | Ended/expired drop off boards entirely | |
| You decide | Planner picks window from GC semantics | |

**User's choice:** Active/upcoming + last 7 days (Recommended)
**Notes:** Usable window without unbounded growth or slow queries.

---

## GC & ops observability

| Option | Description | Selected |
|--------|-------------|----------|
| Heavy-text columns only | Purge description_raw + detail at 24h-after-end_date / 48h-after-rejection; metadata retained | ✓ |
| Heavy text, then delete old rows later | Two-stage: purge heavy text, then delete whole rows after longer retention | |
| Full row deletion at 24h/48h | Delete entire rows at marks; aggressive but destroys audit trail | |
| You decide | Planner models byte growth and retention | |

**User's choice:** Heavy-text columns only (Recommended)
**Notes:** Matches MEM-05 literally ("retaining tombstones + taste rules"); heavy text is where bytes are.

| Option | Description | Selected |
|--------|-------------|----------|
| IST midnight | GC runs at 00:00 Asia/Kolkata with jitter | ✓ |
| UTC midnight | 00:00 UTC matching gateway-daily-cap-reset precedent | |
| You decide | Planner picks based on cron conventions | |

**User's choice:** IST midnight (Recommended)
**Notes:** Midnight means owner's midnight; consistent with scheduler timezone convention.

| Option | Description | Selected |
|--------|-------------|----------|
| New #🛠-ops-health channel | Dedicated ops channel via resolveChannel env-ID-first | ✓ |
| Reuse existing channel | Send ops alerts to e.g. #raw-incoming-feeds | |
| DM the owner | Direct messages for ops alerts | |
| You decide | Planner decides destination | |

**User's choice:** New #🛠-ops-health channel (Recommended)
**Notes:** Carries GC summaries/failures, tunnel up/down, watchdog heartbeats; keeps alert channels clean.

| Option | Description | Selected |
|--------|-------------|----------|
| Scripted drills in infra/oracle/drills/ | kill-cloudflared.sh, gc-verify.sh, tunnel-restart-recovery.sh | ✓ |
| Scripted drills + vitest local-mode | Add vitest coverage for GC predicate alongside live drills | |
| Manual runbook only | Documented manual steps, no new scripts | |
| You decide | Planner designs verification | |

**User's choice:** Scripted drills in infra/oracle/drills/ (Recommended)
**Notes:** Same style as edge-reject.sh / wipe-restore.sh; proves criterion 4 (kill-tests).

---

## the agent's Discretion

- Stream server language/framework (Node on VM is natural; planner picks)
- SSE snapshot/delta event schema
- Exact staleness banner threshold and wording
- Exact filter field names + pagination for GET endpoints
- Tab order + active-tab persistence
- TBA queue presentation within its tab
- Health-grid column layout + cell styling
- dashboard.service resource limits beyond restart=always
- GET endpoints returning JSON vs minimal markup

---

## Deferred Ideas

- Single-origin dashboard (serve UI + API + SSE entirely from VM through tunnel) — considered and rejected in favor of Pages + VM stream origin (retains D-17 "no shortcut" guarantee)
- Manual dashboard mutations — out of scope per PROJECT.md v1 read-only
- Mobile-responsive dashboard layout — out of scope; owner telemetry view, not alert-routing surface
- Dashboard-managed cookie rotation / secret management — out of scope; owner-run script remains
