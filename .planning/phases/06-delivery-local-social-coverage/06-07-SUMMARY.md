---
phase: 06-delivery-local-social-coverage
plan: 07
subsystem: security
tags: [realpathSync, symlink, path-traversal, ALLOWED_COOKIE_DIR, social-cookies, CR-01, WR-06, ING-05]

# Dependency graph
requires:
  - phase: 05-jobs-loot-pipelines
    provides: social.ts CandidateSource + readSocialCookies (existing module being hardened)
provides:
  - symlink-safe cookie file read via fs.realpathSync + ALLOWED_COOKIE_DIR confinement
affects: [06-delivery-local-social-coverage, social polling pipeline, X/LinkedIn session cookies]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 879    # chars/4 over realized diff (3515 added chars across 2 files)
  tasks: 1       # tasks completed
  commits: 2     # MEASURED: git rev-list --count ${PLAN_HEAD_BEFORE}..HEAD (#3968) — includes interleaved parallel-executor commit

# Tech tracking
tech-stack:
  added: []
  patterns: [realpathSync-before-read symlink resolution, directory-confinement guard, never-throw source contract preserved via list() try/catch]

key-files:
  created: []
  modified:
    - packages/discord-router/src/portals/social.ts - readSocialCookies now resolves symlinks via realpathSync and confines resolved path to ALLOWED_COOKIE_DIR
    - packages/discord-router/src/portals/social.test.ts - realpathSync mock + 3 new confinement tests + updated existing tests to allowed-dir paths

key-decisions:
  - "Used fs.realpathSync() to resolve symlinks before any confinement check or file read, per plan's CR-01/WR-06 fix spec"
  - "Validated resolved path starts with ALLOWED_COOKIE_DIR + '/' and throws Error if outside (not silently returning [])"
  - "readFileSync operates on the realpath-resolved path, not the raw input path"
  - "Removed string-based isSafeCookiePath check (insufficient against symlink traversal — the root cause of G-06-3)"
  - "Preserved socialSource.list() never-throw contract: readSocialCookies may throw, list() catches and returns []"

requirements-completed: [ING-05]

# Coverage metadata (#1602) — per-deliverable Requirements Traceability Matrix.
coverage:
  - id: D1
    description: "readSocialCookies resolves symlinks via realpathSync and confines resolved path to ALLOWED_COOKIE_DIR; symlink traversal rejected; valid cookie files read normally"
    requirement: ING-05
    verification:
      - kind: unit
        ref: "packages/discord-router/src/portals/social.test.ts#readSocialCookies throws when resolved path is outside ALLOWED_COOKIE_DIR"
        status: pass
      - kind: unit
        ref: "packages/discord-router/src/portals/social.test.ts#readSocialCookies uses resolved realpath path for readFileSync (symlink)"
        status: pass
      - kind: unit
        ref: "packages/discord-router/src/portals/social.test.ts#readSocialCookies parses JSON array of cookie objects within allowed dir"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-10-17T07:41:47Z
status: complete
plan_head_before: 3aba6c6e9aa988efb393f46ecd4dd6fb1a4232a6
plan_head_after: 3ffc239c12e1b3560e67a25cdc934cd3e15fa8cd
---

# Phase 06 Plan 07: Gap Closure G-06-3 Summary

**realpathSync symlink resolution + ALLOWED_COOKIE_DIR directory confinement added to readSocialCookies in social.ts, closing the CR-01/WR-06 arbitrary-file-read/symlink-traversal vulnerability**

## Performance

- **Duration:** 9 min (07:32:57Z → 07:41:47Z)
- **Started:** 2026-10-17T07:32:57Z
- **Completed:** 2026-10-17T07:41:47Z
- **Tasks:** 1 completed / 1 total
- **Files modified:** 2

## Accomplishments

- `readSocialCookies` now calls `fs.realpathSync(path)` before any confinement check or file read
- Resolved path validated to start with `ALLOWED_COOKIE_DIR + '/'` (`/opt/zod/social-cookies/`); throws `Error` if outside
- `readFileSync` operates on the realpath-resolved path, never the raw input
- Symlink pointing outside `ALLOWED_COOKIE_DIR` is rejected — no file read occurs
- Valid cookie file within `ALLOWED_COOKIE_DIR` is read and parsed normally
- `socialSource.list()` never-throw contract preserved (catches `readSocialCookies` throws, returns `[]`)
- All 12 tests in `social.test.ts` pass; full discord-router package suite: 191/192 pass (1 pre-existing router-service failure unrelated to this plan)

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer, tdd=true): Add realpathSync symlink resolution and ALLOWED_COOKIE_DIR validation to readSocialCookies** - `813a8f1` (fix)

## Files Created/Modified

- `packages/discord-router/src/portals/social.ts` - Imported `realpathSync` from `node:fs`; rewrote `readSocialCookies` to resolve symlinks first, confine to `ALLOWED_COOKIE_DIR`, read resolved path; removed `isSafeCookiePath`
- `packages/discord-router/src/portals/social.test.ts` - Added `realpathSync` to `node:fs` mock; added 3 confinement tests (outside-dir throw, valid-dir read, resolved-path-for-readFileSync); updated existing tests to use `/opt/zod/social-cookies/` paths

## Decisions Made

- Followed the plan's CR-01/WR-06 fix exactly: `realpathSync` → `startsWith(ALLOWED_COOKIE_DIR + '/')` → `readFileSync(resolved)`
- Removed `isSafeCookiePath` string-based check rather than repurposing as pre-check, since `realpathSync` provides complete symlink resolution and the string check was the vulnerability root cause

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 deviations, no auth gates, no package installs.

**Total deviations:** 0
**Impact on plan:** N/A

## Issues Encountered

None. Pre-existing test failures in `social.test.ts` (3/10 failing with `/tmp/` paths outside allowed dir) were resolved by updating test paths to the allowed directory and mocking `realpathSync` — this was expected given the gap (tests were written against `/tmp/` but implementation confines to `/opt/zod/social-cookies/`).

## User Setup Required

None - no external service configuration required. `SOCIAL_COOKIES_PATH` must point to a file under `/opt/zod/social-cookies/` at runtime (existing env config, no new keys).

## Next Phase Readiness

- G-06-3 (CR-01 partial / WR-06) closed — social cookie path is symlink-safe
- Requirement ING-05 satisfied
- Ready for subsequent phase-06 plans

---
*Phase: 06-delivery-local-social-coverage*
*Completed: 2026-10-17T07:41:47Z*
