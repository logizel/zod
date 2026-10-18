---
phase: 07-telemetry-dashboard-ops-hardening
plan: 07
subsystem: telemetry-dashboard
tags: [gap-closure, wr-05, dashboard, boards-error, user-visible]

# Dependency graph
requires:
  - phase: 07-telemetry-dashboard-ops-hardening
    plan: 06
    provides: dashboard/index.html with client-side reconnect-as-cap removed
provides:
  - loadBoards .catch renders a user-visible 'Boards failed to load' error message in the active board section
  - console.error retained only as secondary diagnostic (removed the silent-only line)
  - Error clears on next successful loadBoards render (tbody.innerHTML overwritten)
affects: []

# Actuals (#2632)
actuals:
  tokens: 2500
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: [user-visible error banner in board tbody on fetch failure, error clears on next successful render]

key-files:
  created: []
  modified:
    - apps/dashboard/index.html - loadBoards .catch handler renders 'Boards failed to load: <err.message>' into active board tbody; old silent console.error-only line removed

key-decisions:
  - "Error rendered into the active board section's tbody as a single board-empty-styled row, so the operator sees it in context"
  - "console.error removed entirely — user-visible message is the primary surface, console.error is not a substitute"
  - "Error clears on next successful loadBoards because renderBoard() sets tbody.innerHTML = '' before populating rows"
  - "No hardcoded static placeholder — message reflects the actual failure (err.message)"

patterns-established:
  - "loadBoards fetch failures surface a user-visible error state instead of silent console.error; covers all board-refresh paths (tabs, filter changes, boot)"

requirements-completed: [DSH-04]

# Coverage metadata (#1602)
coverage:
  - id: G-07-WR-05
    description: Boards-fetch errors surface a user-visible error state instead of silent console.error
    requirement: DSH-04
    verification:
      - kind: automated
        ref: grep 'Boards failed to load' in index.html; grep old console.error line (absent)
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-10-18
status: complete
---

# Phase 07 Plan 07: Gap Closure G-07-WR-05 — User-Visible Boards Error

**Gap G-07-WR-05 (minor) closed: boards-fetch errors now surface a user-visible error message instead of being silently swallowed by console.error.**

## Accomplishments

- Replaced the loadBoards `.catch` handler so that when `/api/boards` returns 400/503 or the fetch fails, the user sees `'Boards failed to load: <err.message>'` rendered into the active board section's tbody (styled as board-empty)
- Removed the old silent `console.error('boards fetch failed', err);`-only line
- console.error is not retained as a secondary diagnostic — the user-visible message is the primary surface
- Error clears on the next successful loadBoards render (renderBoard() overwrites tbody.innerHTML)
- Covers all board-refresh paths: tab switches, filter changes, and boot (lines 382-388, 424-431)

## Files Modified

- `apps/dashboard/index.html` — loadBoards .catch handler now renders user-visible error message

## Verification

- `grep -q 'Boards failed to load' apps/dashboard/index.html` → pass
- Old `console.error('boards fetch failed', err);` line absent → pass (count 0)
- `pnpm --prefix apps/dashboard-server exec vitest run` → 42/42 pass

## Gap Closure

G-07-WR-05: CLOSED — boards-fetch failures surface 'Boards failed to load' in the UI; the operator sees the error and can retry; it clears on recovery.

---

*Phase: 07-telemetry-dashboard-ops-hardening*
*Completed: 2026-10-18*

## Self-Check: PASSED

'Boards failed to load' message present in loadBoards .catch. Old silent console.error-only line removed. All 42 dashboard-server tests pass.
