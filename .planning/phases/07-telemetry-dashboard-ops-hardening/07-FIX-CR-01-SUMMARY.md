---
phase: 07-telemetry-dashboard-ops-hardening
plan: 05
subsystem: telemetry-dashboard
tags: [gap-closure, cr-01, dashboard, sse-url, zero-trust]

# Dependency graph
requires:
  - phase: 07-telemetry-dashboard-ops-hardening
    provides: existing dashboard/index.html shell with STREAM_URL/BOARDS_URL dataset reads (lines 252-253)
provides:
  - apps/dashboard/index.html <script> tag carries data-stream-url and data-boards-url attributes pointing to tunnel origin
affects:
  - 07-FIX-WR-04 (index.html reconnect-as-cap removal — same file, later wave)
  - 07-FIX-WR-05 (index.html loadBoards error handler — same file, later wave)

# Actuals (#2632)
actuals:
  tokens: 2500
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: [dataset-driven stream/boards URL resolution, tunnel-origin SSE + boards routing]

key-files:
  created: []
  modified:
    - apps/dashboard/index.html - <script> tag gains data-stream-url="https://dash.example.com/api/stream" and data-boards-url="https://dash.example.com/api/boards" attributes

key-decisions:
  - "Hostname dash.example.com must equal the provisioned infra/cloudflared/config.yml DASHBOARD_HOSTNAME routed to localhost:3000 (D-01); no different host used"
  - "Client already reads document.currentScript.dataset.streamUrl / .dataset.boardsUrl with /api/stream and /api/boards fallbacks (lines 252-253); adding attributes makes production client resolve to tunnel origin"

patterns-established:
  - "data-stream-url / data-boards-url data attributes on dashboard <script> tag direct SSE + boards traffic to VM tunnel origin, not Cloudflare Pages origin"

requirements-completed: [DSH-02, DSH-04]

# Coverage metadata (#1602)
coverage:
  - id: G-07-CR-01
    description: Dashboard SSE client connects to absolute tunnel origin via data-stream-url/data-boards-url attributes
    requirement: DSH-04
    verification:
      - kind: automated
        ref: grep data-stream-url data-boards-url on apps/dashboard/index.html script tag
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-10-18
status: complete
---

# Phase 07 Plan 05: Gap Closure G-07-CR-01 — Dashboard SSE URL Tunnel Origin

**Gap G-07-CR-01 (blocker) closed: the dashboard SSE client now connects to the VM tunnel origin (https://dash.example.com/api/stream and /api/boards) via data-stream-url and data-boards-url data attributes on the <script> tag, instead of falling back to relative /api/* URLs that resolve against the Cloudflare Pages origin.**

## Accomplishments

- Added `data-stream-url="https://dash.example.com/api/stream"` and `data-boards-url="https://dash.example.com/api/boards"` attributes to the inline `<script>` tag at apps/dashboard/index.html line 246
- Client already reads `document.currentScript.dataset.streamUrl` / `.dataset.boardsUrl` (lines 252-253), so the attributes make the production client resolve to the tunnel origin
- Hostname dash.example.com matches the provisioned infra/cloudflared/config.yml DASHBOARD_HOSTNAME routed to localhost:3000

## Files Modified

- `apps/dashboard/index.html` — `<script>` tag carries both data attributes

## Verification

- `grep -q 'data-stream-url="https://dash.example.com/api/stream"' apps/dashboard/index.html` → pass
- `grep -q 'data-boards-url="https://dash.example.com/api/boards"' apps/dashboard/index.html` → pass

## Gap Closure

G-07-CR-01: CLOSED — SSE and board fetches target the VM tunnel origin, not the Cloudflare Pages origin.

---

*Phase: 07-telemetry-dashboard-ops-hardening*
*Completed: 2026-10-18*

## Self-Check: PASSED

Both data attributes verified present on the <script> tag. STREAM_URL/BOARDS_URL resolve to https://dash.example.com/api/stream and /api/boards in production.
