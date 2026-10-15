---
status: complete
phase: 01-foundation
source: [01-VERIFICATION.md]
started: 2026-10-15T17:50:00Z
updated: 2026-10-15T18:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Run the one-command rebuild on the real Oracle Ampere host per runbook.md
expected: Working VM with PocketBase + Turso schemas restored, all supervised services active, tunnel pre-check green
result: pass

### 2. Run the live wipe-restore drill with Turso credentials against a real test database
expected: Opportunity/telemetry/ledger counts match pre-wipe, cold rows unchanged, new writes flow to both stores
result: pass

### 3. Assert zero public listeners and unauthenticated edge rejection at the real dashboard URL
expected: ss shows loopback-only PB bind with no public listeners; unauth shell + stream requests return 401/403 or login redirect
result: pass

### 4. Confirm live VM memory baseline holds 22-30% and the dead-man watchdog pages a real silence
expected: Buffer holds the band on the Ampere host; stale heartbeats trigger a provider page
result: pass

### 5. Install the pre-commit framework and attempt a secret-bearing commit
expected: Gitleaks hook blocks the commit
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
