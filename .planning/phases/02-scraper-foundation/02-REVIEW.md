---
phase: 02-scraper-foundation
reviewed: 2026-10-15T21:40:00Z
depth: deep
files_reviewed: 17
files_reviewed_list:
  - packages/browser/src/index.ts
  - packages/browser/src/queue.ts
  - packages/config/src/env.ts
  - packages/db-hot/src/client.ts
  - packages/db-hot/src/schema.ts
  - packages/db-hot/src/scratchpad.ts
  - packages/db-hot/src/telemetry.ts
  - packages/logger/src/index.ts
  - packages/sanitize/src/fetch.ts
  - packages/sanitize/src/index.ts
  - packages/sanitize/src/jina.ts
  - packages/sanitize/src/strip.ts
  - packages/scout/src/expiry.ts
  - packages/scout/src/index.ts
  - packages/scout/src/spam.ts
  - packages/scheduler/src/jobs.ts
  - packages/scheduler/src/registry.ts
findings:
  critical: 3
  warning: 4
  info: 4
  total: 11
status: issues_found
---

# Phase 02 (Scraper Foundation): Code Review Report

**Reviewed:** 2026-10-15T21:40:00Z
**Depth:** deep
**Files Reviewed:** 17
**Status:** issues_found

## Summary

All package test suites pass and `tsc -b` is clean, but adversarial review found 3 critical, 4 warning, and 4 info findings in the scraper foundation source. Controls at risk: incomplete SSRF host guard, service-token file write that follows symlinks / ignores prior file mode, one-level secret redaction, weak env validation, cached rejected browser launch promise, swallowed scratchpad errors, and an unguarded prefilter throw that can abort an entire tick.

## Critical Issues

### CR-01: SSRF guard misses private-address encodings and host suffixes
**File:** `packages/sanitize/src/fetch.ts:15-32`
**Issue:** `isPrivateHost` only covers RFC1918, 127/8, 169.254/16, 0/8, localhost, ::1, and fe80/fc/fd/:: prefixes. It misses IPv4-mapped IPv6, ULA/link-local forms, *.localhost/*.local, and decimal/hex/octal IPv4 encodings.
**Fix:** A robust resolver-aware check (normalize IP, block loopback/LAN/metadata ranges, reject local suffixes, and re-check the resolved address).

### CR-02: Service token file write follows symlinks and ignores prior mode
**File:** `packages/db-hot/src/client.ts:58-65`
**Issue:** `writeFileSync(..., { mode: 0o600 })` follows symlinks and only sets mode on creation; an existing file keeps its prior mode, so the token can be world-readable or redirect at an arbitrary file.
**Fix:** Refuse symlink targets, write a temp file with mode 0o600, and atomically rename while `chmodSync`-ing the final path.

### CR-03: Secret redaction stops one nesting level deep
**File:** `packages/logger/src/index.ts:8-25`
**Issue:** Redact patterns include only top-level and one-level wildcards; deeper nested secrets pass through.
**Fix:** Add deep wildcard patterns (`**.password`, etc.) or a recursive `redactDeep` helper at log call sites.

## Warnings

### WR-01: Env gate accepts empty/garbage PB_URL and TURSO_DATABASE_URL
**File:** `packages/config/src/env.ts:8,12`
**Issue:** No `.min(1)`/`.url()` or scheme check; empty `.env.example` values pass.
**Fix:** `PB_URL: z.string().min(1).url()` and `TURSO_DATABASE_URL: z.string().min(1).refine(...)`

### WR-02: Browser launcher caches a rejected launch promise
**File:** `packages/browser/src/queue.ts:9-19`
**Issue:** `browserPromise` is never cleared on rejection, permanently failing subsequent fetches.
**Fix:** `.catch((err) => { browserPromise = null; throw err; })` on launch.

### WR-03: scratchpad `readRow` swallows non-404 errors and can return undefined
**File:** `packages/db-hot/src/scratchpad.ts:34-49`
**Issue:** All errors fall through to `getFirstListItem`; an undefined `getOne` result reaches `.attempts`.
**Fix:** Re-throw non-404 errors and treat undefined as not-found.

### WR-04: A throwing prefilter/runPrecheck aborts the whole tick
**File:** `packages/scheduler/src/jobs.ts:187-220`
**Issue:** Unguarded `prefilter` call and partial dependency checks can throw out of the candidate loop, killing the tick and preventing heartbeat records.
**Fix:** Wrap both calls in per-candidate try/catch and continue to the next candidate.

## Info

### IN-01: Browser uses `console.warn` instead of shared logger
**File:** `packages/browser/src/queue.ts:54`
**Fix:** Use `@zod/logger`.

### IN-02: Tick injection relies on untyped `any` bags
**File:** `packages/scheduler/src/jobs.ts:108-177`
**Fix:** Replace `any` bags with a typed `TickDependencies` interface and one normalizer.

### IN-03: Scout spam blocklist uses unbounded substring matching
**File:** `packages/scout/src/spam.ts:4-33`
**Fix:** Use word-boundary regexes.

### IN-04: Unnamed magic values in fetch/sanitize paths
**File:** `packages/sanitize/src/fetch.ts:79`, `packages/sanitize/src/jina.ts:17`, `packages/sanitize/src/strip.ts:4`
**Fix:** Export named constants.

---

_Reviewed: 2026-10-15T21:40:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_