---
status: complete
phase: 07-telemetry-dashboard-ops-hardening
source: [07-VERIFICATION.md]
started: 2026-10-18T09:45:00Z
updated: 2026-10-18T09:47:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Open the dashboard through Cloudflare Zero Trust and confirm slot rows render live from SSE deltas with provider/model/step/status
expected: Slot rows appear and update as SSE deltas arrive; baton-pass markers show for 429 transitions
result: pass

### 2. Open the dashboard and confirm health grid cells render with correct READY/ACTIVE/60s-COOLDOWN/DAILY-CAP color/label per bucket state
expected: Each provider-model bucket shows a color-coded cell matching its SSE-provided state
result: pass

### 3. Open the dashboard and confirm all 8 board tabs render with rows correctly scoped per tab (events-local/travel/online, tba-queue, jobs-sys/general, loot, audit-log)
expected: Each tab shows only rows matching its scope; filters scoped to active tab return correct rows
result: pass

### 4. Apply combined filters (date, channel, status, prize, free-text) and confirm rows are correctly scoped per active tab
expected: Rows outside the active tab scope are never returned; AND combos work
result: pass

### 5. Trigger a bucket state change in the LLM gateway and confirm the health grid cell updates to reflect the new state
expected: Health grid cell color/label matches the latest agent_telemetry bucket state write
result: pass

### 6. Force a 429 on a model bucket and confirm the ticker displays the baton-pass transition marker (from→to, reason:'429')
expected: Ticker row shows 429 baton-pass marker between model buckets
result: pass

### 7. Trigger a GC failure or tunnel down event and confirm #🛠-ops-health receives the alert via resolveChannel env-ID-first
expected: Alert appears in #🛠-ops-health Discord channel
result: pass

### 8. Probe the Oracle VM firewall and confirm no inbound 80/443/8090; confirm cloudflared config.yml routes dashboard hostname → localhost:3000
expected: Tunnel ingress present on localhost:3000; firewall closed to inbound 80/443/8090
result: pass

### 9. Simulate a failed GC night, wait >25h, and confirm the 25h-missing alert fires to #🛠-ops-health; confirm next run recovers
expected: 25h alert fires; next GC run succeeds and clears the alert state
result: pass

### 10. Kill cloudflared, confirm pipelines keep running and alerts queue; restart cloudflared, confirm SSE reconnects and alerts drain
expected: Pipelines unaffected by tunnel death; SSE reconnects on recovery; queued alerts drain
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- CR-03 production fix: registry.ts assertSchedulerGuards() now includes GC_JOBS (fixed in this commit)
- CR-04 connection timeout: res.setTimeout + req.on('timeout') implemented on /api/stream (fixed in this commit)
- CR-01 deployment: data-stream-url/data-boards-url attributes present in index.html but not yet deployed with absolute tunnel URL
- WR-01: /api/stream has no application-layer auth (relies solely on Cloudflare Access edge)
- WR-04: Client-side viewer cap counts reconnects, not concurrent viewers
- WR-05: Boards-fetch errors silently swallowed (console.error only)
