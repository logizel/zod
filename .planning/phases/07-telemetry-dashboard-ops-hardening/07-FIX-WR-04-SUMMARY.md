---
phase: 07-telemetry-dashboard-ops-hardening
plan: 06
subsystem: telemetry-dashboard
tags: [gap-closure, wr-04, dashboard, sse-reconnect, viewer-cap]

# Dependency graph
requires:
  - phase: 07-telemetry-dashboard-ops-hardening
    plan: 05
    provides: dashboard/index.html with data-stream-url/data-boards-url deployed (tunnel-origin fix)
provides:
  - Client-side reconnect-as-cap viewer logic removed from apps/dashboard/index.html
  - Exponential backoff + jitter reconnect retained
  - Server-side SseHub viewer cap remains the concurrent-connection bound
affects:
  - 07-FIX-WR-05 (index.html loadBoards error handler — same file, later wave)

# Actuals (#2632)
actuals:
  tokens: 2500
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: [server-side concurrent-connection bounding via SseHub viewer cap, client-side exponential backoff without self-lock]

key-files:
  created: []
  modified:
    - apps/dashboard/index.html - removed reconnects variable, client-side SSE_VIEWER_CAP const, and 'stream limit reached' branch in es.onerror; backoff reconnect retained

key-decisions:
  - "Concurrent-viewer bounding stays server-side via SseHub constructor viewerCap (env.SSE_VIEWER_CAP, default 2) — already in place from CR-04 fix (D-08)"
  - "Exponential backoff + jitter reconnect (setTimeout(connect, backoff + Math.random() * 1000)) retained — only the mislabeled reconnect-as-cap counter removed"
  - "No new npm packages; framework-free vanilla JS per D-02"

patterns-established:
  - "Client reconnects never self-lock: es.onerror closes, nulls, and schedules reconnect with backoff+jitter unconditionally; no viewer-cap gating on the client"

requirements-completed: [DSH-01, DSH-02]

# Coverage metadata (#1602)
coverage:
  - id: G-07-WR-04
    description: Client-side viewer cap no longer counts reconnect attempts; concurrent-viewer bounding is server-side
    requirement: DSH-02
    verification:
      - kind: automated
        ref: grep reconnects stream-limit-reached SSE_VIEWER_CAP in index.html (all absent); grep setTimeout(connect) backoff Math.min (present)
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-10-18
status: complete
---

# Phase 07 Plan 06: Gap Closure G-07-WR-04 — Client-Side Viewer Cap Fix

**Gap G-07-WR-04 (minor) closed: the client-side viewer cap no longer counts reconnect attempts. A single flaky client no longer locks itself out after ~3 failed reconnects. Concurrent-viewer bounding remains server-side via the SseHub viewer cap.**

## Accomplishments

- Removed the `reconnects` variable from apps/dashboard/index.html
- Removed the client-side `const SSE_VIEWER_CAP = 2` and its D-08 comment
- Removed the `if (reconnects > SSE_VIEWER_CAP) { ... 'stream limit reached' ... return; }` branch in `es.onerror`
- Retained exponential backoff + jitter reconnect: `setTimeout(connect, backoff + Math.random() * 1000); backoff = Math.min(backoff * 2, MAX_BACKOFF);`
- Retained `backoff = 1000` reset on the `connected` event
- Server-side SseHub viewer cap untouched (constructor param driven by env.SSE_VIEWER_CAP)

## Files Modified

- `apps/dashboard/index.html` — client-side reconnect-as-cap viewer logic removed

## Verification

- `reconnects` count in index.html → 0 (pass)
- `stream limit reached` count → 0 (pass)
- `SSE_VIEWER_CAP` count → 0 (pass)
- `setTimeout(connect` present → pass
- `backoff = Math.min(backoff * 2` present → pass

## Gap Closure

G-07-WR-04: CLOSED — client-side reconnect-as-cap counter removed; concurrent-viewer bounding is server-side via SseHub viewer cap (D-08); a single flaky client stays connected across reconnects.

---

*Phase: 07-telemetry-dashboard-ops-hardening*
*Completed: 2026-10-18*

## Self-Check: PASSED

No reconnects variable, no SSE_VIEWER_CAP const, no 'stream limit reached' branch remain in index.html. Exponential backoff + jitter reconnect retained. Server-side SseHub viewer cap intact.
